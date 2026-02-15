from uuid import UUID
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, update

from app.core.security import verify_password, hash_password, create_access_token, create_refresh_token, decode_token
from app.core.exceptions import UnauthorizedException
from app.models import User, Organization, OrganizationUser
from app.schemas import TokenResponse, AdminLoginResponse, AdminLoginResponseUser, ForgotPasswordRequest, ResetPasswordRequest
from app.core.config import settings
import asyncio
import logging
from datetime import timedelta
from fastapi import HTTPException

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def admin_login(self, email: str, password: str) -> AdminLoginResponse:
        """
        Authenticate organization admin and return token + user info.
        Uses direct DB connection.
        """
        # 1. Fetch Organization by admin_email
        try:
            query = select(Organization).where(Organization.admin_email == email)
            result = await self.session.execute(query)
            org = result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"DB error during admin login: {e}")
            raise UnauthorizedException("Authentication service unavailable")

        if not org:
            raise UnauthorizedException("Invalid email or password")

        # 2. Check if organization exists and is active
        if org.is_deleted:
            raise UnauthorizedException("Invalid email or password")
        
        if str(org.subscription_status or "").lower() != "active":
            raise UnauthorizedException("Organization account is not active")

        # 3. Verify password
        if not verify_password(password, org.admin_password_hash or ""):
            raise UnauthorizedException("Invalid email or password")

        # 4. Generate JWT
        org_id = org.id
        token = create_access_token(subject=org_id, extra_data={"role": "admin", "org_id": str(org_id)})

        # 5. Build response
        return AdminLoginResponse(
            success=True,
            token=token,
            user=AdminLoginResponseUser(
                userID=org_id,
                organizationID=org_id,
                fullName=org.organization_name,
                role="admin"
            )
        )

    async def organization_user_login(self, email: str, password: str) -> AdminLoginResponse:
        """
        Authenticate organization user (HR/Technical recruiter) and return token + user info.
        Uses OrganizationUser model with email and password_hash.
        """
        # 1. Fetch OrganizationUser by email
        try:
            query = select(OrganizationUser).where(OrganizationUser.email == email)
            result = await self.session.execute(query)
            user = result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"DB error during organization user login: {e}")
            raise UnauthorizedException("Authentication service unavailable")

        if not user:
            raise UnauthorizedException("Invalid email or password")

        # 2. Check if user exists and is active
        if user.is_deleted:
            raise UnauthorizedException("Invalid email or password")
        
        if str(user.status or "").lower() != "active":
            raise UnauthorizedException("User account is not active")

        # 3. Verify password
        if not verify_password(password, user.password_hash or ""):
            raise UnauthorizedException("Invalid email or password")

        # 4. Generate JWT
        user_id = user.id
        token = create_access_token(
            subject=user_id, 
            extra_data={
                "role": user.role, 
                "org_id": str(user.organization_id)
            }
        )

        # 5. Update last login timestamp
        from datetime import datetime
        user.last_login_at = datetime.utcnow()
        self.session.add(user)
        await self.session.commit()

        # 6. Build response
        full_name = f"{user.first_name} {user.last_name}".strip()
        return AdminLoginResponse(
            success=True,
            token=token,
            user=AdminLoginResponseUser(
                userID=user_id,
                organizationID=user.organization_id,
                fullName=full_name,
                role=user.role
            )
        )

    async def forgot_password(self, email: str) -> bool:
        """
        Request a password reset. Sends an email (logged to console for now).
        """
        # 1. Fetch Organization by admin_email
        query = select(Organization).where(Organization.admin_email == email)
        result = await self.session.execute(query)
        org = result.scalar_one_or_none()

        if not org:
            # We return True even if email not found to prevent user enumeration
            logger.info(f"Password reset requested for non-existent email: {email}")
            return True
            
        org_id = org.id

        # 2. Generate a sensitive token (short lived: 15 mins)
        token = create_access_token(
            subject=org_id, 
            expires_delta=timedelta(minutes=15),
            extra_data={"role": "admin", "type": "password_reset"}
        )

        # 3. "Send" Email
        reset_link = f"http://localhost:5173/admin/reset-password?token={token}"
        
        logger.info("\n" + "="*50)
        logger.info(f"PASSWORD RESET REQUEST FOR: {email}")
        logger.info(f"RESET LINK: {reset_link}")
        logger.info("="*50 + "\n")
        
        # In the future, use an actual SMTP client here if settings.SMTP_HOST is set

        return True

    async def reset_password(self, token: str, new_password: str) -> bool:
        """
        Reset password using a token.
        """
        # 1. Decode and verify token
        try:
            payload = decode_token(token)
            if payload.get("type") != "password_reset":
                raise UnauthorizedException("Invalid reset token type")
            org_id_str = payload.get("sub")
            org_id = UUID(org_id_str)
        except Exception:
            raise UnauthorizedException("Invalid or expired reset token")

        # 2. Hash new password
        new_hash = hash_password(new_password)

        # 3. Update in DB
        try:
            # Verify org exists first
            res = await self.session.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org = res.scalar_one_or_none()
            
            if not org:
                raise UnauthorizedException("Organization not found")

            # Update password
            org.admin_password_hash = new_hash
            self.session.add(org)
            await self.session.commit()
            
        except Exception as e:
            logger.error(f"Error resetting password: {e}")
            await self.session.rollback()
            raise UnauthorizedException("Account service unavailable")

        return True

    async def organization_user_forgot_password(self, email: str) -> bool:
        """
        Request a password reset for organization user (HR/Technical recruiter).
        Sends an email (logged to console for now).
        """
        # 1. Fetch OrganizationUser by email
        query = select(OrganizationUser).where(OrganizationUser.email == email)
        result = await self.session.execute(query)
        user = result.scalar_one_or_none()

        if not user:
            # We return True even if email not found to prevent user enumeration
            logger.info(f"Password reset requested for non-existent organization user email: {email}")
            return True
            
        user_id = user.id

        # 2. Generate a sensitive token (short lived: 15 mins)
        token = create_access_token(
            subject=user_id, 
            expires_delta=timedelta(minutes=15),
            extra_data={"role": user.role, "type": "password_reset"}
        )

        # 3. "Send" Email
        reset_link = f"http://localhost:5173/recruiter/reset-password?token={token}"
        
        logger.info("\n" + "="*50)
        logger.info(f"PASSWORD RESET REQUEST FOR ORGANIZATION USER: {email}")
        logger.info(f"RESET LINK: {reset_link}")
        logger.info("="*50 + "\n")
        
        # In the future, use an actual SMTP client here if settings.SMTP_HOST is set

        return True

    async def organization_user_reset_password(self, token: str, new_password: str) -> bool:
        """
        Reset password for organization user using a token.
        """
        # 1. Decode and verify token
        try:
            payload = decode_token(token)
            if payload.get("type") != "password_reset":
                raise UnauthorizedException("Invalid reset token type")
            user_id_str = payload.get("sub")
            user_id = UUID(user_id_str)
        except Exception:
            raise UnauthorizedException("Invalid or expired reset token")

        # 2. Hash new password
        new_hash = hash_password(new_password)

        # 3. Update in DB
        try:
            # Verify user exists first
            res = await self.session.execute(
                select(OrganizationUser).where(OrganizationUser.id == user_id)
            )
            user = res.scalar_one_or_none()
            
            if not user:
                raise UnauthorizedException("User not found")

            # Update password
            user.password_hash = new_hash
            self.session.add(user)
            await self.session.commit()
            
        except Exception as e:
            logger.error(f"Error resetting organization user password: {e}")
            await self.session.rollback()
            raise UnauthorizedException("Account service unavailable")

        return True

    async def change_password(self, user_id: UUID, old_password: str, new_password: str, is_admin: bool = False) -> bool:
        """
        Change password for logged-in user. Requires verification of old password.
        """
        try:
            current_hash = None
            user_obj = None
            
            if is_admin:
                # 1. Fetch Organization admin password
                res = await self.session.execute(
                    select(Organization).where(Organization.id == user_id)
                )
                user_obj = res.scalar_one_or_none()
                if user_obj:
                    current_hash = user_obj.admin_password_hash
            else:
                # 2. Fetch User password
                res = await self.session.execute(
                    select(OrganizationUser).where(OrganizationUser.id == user_id)
                )
                user_obj = res.scalar_one_or_none()
                if user_obj:
                    current_hash = user_obj.password_hash

            if not user_obj or not current_hash:
                raise UnauthorizedException("User not found")

            # 3. Verify old password
            if not verify_password(old_password, current_hash):
                raise UnauthorizedException("Incorrect old password")
            
            # 4. Hash new password
            new_hash = hash_password(new_password)
            
            # 5. Update
            if is_admin:
                user_obj.admin_password_hash = new_hash
            else:
                user_obj.password_hash = new_hash
                
            self.session.add(user_obj)
            await self.session.commit()
                
            return True
            
        except Exception as e:
            await self.session.rollback()
            if isinstance(e, UnauthorizedException):
                raise e
            print(f"Error changing password: {e}")
            raise HTTPException(status_code=500, detail="Failed to change password")

    async def login(self, email: str, password: str) -> TokenResponse:
        # TODO: Implement login
        pass

    async def refresh_tokens(self, refresh_token: str) -> TokenResponse:
        # TODO: Implement token refresh
        pass

    async def get_current_user(self, token: str) -> User:
        """Get current user from token."""
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
            role = payload.get("role")
            
            if not user_id:
                raise UnauthorizedException("Invalid token: no subject")
                
            if role == "admin":
                # Handle Admin (Organization) login
                try:
                    query = select(Organization).where(Organization.id == UUID(user_id))
                    result = await self.session.execute(query)
                    org_data = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB error fetching current admin: {e}")
                    raise UnauthorizedException("Organization not found")

                if not org_data:
                    raise UnauthorizedException("Organization not found")
                
                # Reconstruct a User-compatible object for dependencies
                # Note: Organization id is organization_id in DB, but User id is id.
                return User(
                    id=org_data.id,
                    organization_id=org_data.id,
                    email=org_data.admin_email,
                    password_hash=org_data.admin_password_hash,
                    first_name=org_data.organization_name,
                    last_name="",
                    role="admin",
                    status="active" # Lowercase to match get_current_active_user check
                )
            else:
                # Handle regular OrganizationUser login
                statement = select(User).where(User.id == UUID(user_id))
                result = await self.session.execute(statement)
                user = result.scalar_one_or_none()
                
                if not user:
                    raise UnauthorizedException("User not found")
                
                # Normalize status for check in deps.py
                if str(user.status).lower() == "active":
                    user.status = "active"
                    
                return user
        except Exception as e:
            if isinstance(e, UnauthorizedException):
                raise e
            logger.error(f"Error in get_current_user: {e}")
            raise UnauthorizedException("Invalid authentication")

    async def _get_user_by_email(self, email: str) -> User | None:
        statement = select(User).where(User.email == email)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def _get_user_by_id(self, user_id: UUID) -> User | None:
        statement = select(User).where(User.id == user_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()
