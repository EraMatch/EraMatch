"""
Email service using fastapi-mail
"""
from pathlib import Path
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Configure the connection using settings from .env
conf = ConnectionConfig(
    MAIL_USERNAME=settings.SMTP_USER or "",
    MAIL_PASSWORD=settings.SMTP_PASSWORD or "",
    MAIL_FROM=settings.EMAILS_FROM_EMAIL or "admin@eramatch.com",
    MAIL_PORT=settings.SMTP_PORT or 587,
    MAIL_SERVER=settings.SMTP_HOST or "smtp.gmail.com",
    MAIL_FROM_NAME=settings.EMAILS_FROM_NAME or "EraMatch HR",
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=bool(settings.SMTP_USER),
    VALIDATE_CERTS=True,
)

fast_mail = FastMail(conf)

class EmailService:
    @staticmethod
    async def send_email_async(subject: str, email_to: str, html_content: str):
        """Core function to send an email."""
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            logger.warning(f"SMTP not fully configured. Simulating email to {email_to} with subject '{subject}'")
            logger.info("\n" + "="*50)
            logger.info(f"EMAIL SENT TO: {email_to}")
            logger.info(f"SUBJECT: {subject}")
            logger.info(f"BODY:\n{html_content}")
            logger.info("="*50 + "\n")
            return
            
        message = MessageSchema(
            subject=subject,
            recipients=[EmailStr(email_to)],
            body=html_content,
            subtype=MessageType.html
        )
        
        try:
            await fast_mail.send_message(message)
            logger.info(f"Successfully sent email to {email_to}")
        except Exception as e:
            logger.error(f"Failed to send email to {email_to}: {str(e)}")

    @staticmethod
    async def send_welcome_email(email: str, name: str, role: str, temp_password: str):
        """Sent when a new recruiter or candidate is created by admin."""
        subject = f"Welcome to EraMatch - Your Temporary Password"
        html = f"""
        <html>
            <body>
                <h2>Welcome to EraMatch, {name}!</h2>
                <p>Your account has been created with the role of <strong>{role}</strong>.</p>
                <p>Please log in using the following temporary password:</p>
                <h3>{temp_password}</h3>
                <p>For security reasons, we highly recommend changing this password upon your first login.</p>
                <br>
                <p>Best regards,<br>The EraMatch Team</p>
            </body>
        </html>
        """
        await EmailService.send_email_async(subject, email, html)

    @staticmethod
    async def send_reassignment_email(email: str, name: str, position_title: str):
        """Sent when a recruiter is assigned to a position."""
        subject = f"New Assignment: {position_title}"
        html = f"""
        <html>
            <body>
                <h2>Hello {name},</h2>
                <p>You have been assigned as a recruiter for a new position: <strong>{position_title}</strong>.</p>
                <p>Please log in to your Recruiter Portal to view the candidate pipeline and start reviewing applications.</p>
                <br>
                <p>Best regards,<br>The EraMatch Team</p>
            </body>
        </html>
        """
        await EmailService.send_email_async(subject, email, html)

    @staticmethod
    async def send_stage_invitation_email(email: str, name: str, stage_title: str, group_id: str):
        """Sent when a recruiter starts a stage for a candidate."""
        login_url = f"https://eramatch.com/login/{group_id}"
        subject = f"Action Required: EraMatch {stage_title} Invitation"
        html = f"""
        <html>
            <body>
                <h2>Hello {name},</h2>
                <p>You have been invited to complete the <strong>{stage_title}</strong> stage for your application.</p>
                <p>Please use the link below to log in and begin this stage:</p>
                <p><a href="{login_url}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: #fff; text-decoration: none; border-radius: 6px;">Log In & Start {stage_title}</a></p>
                <p>We wish you the best of luck!</p>
                <br>
                <p>Best regards,<br>The EraMatch Recruiting Team</p>
            </body>
        </html>
        """
        await EmailService.send_email_async(subject, email, html)

    @staticmethod
    async def send_password_reset_email(email: str, name: str, reset_link: str):
        """Sent when a user requests a password reset."""
        subject = f"EraMatch - Password Reset Request"
        html = f"""
        <html>
            <body>
                <h2>Hello {name},</h2>
                <p>We received a request to reset your password. Click the link below to set a new password:</p>
                <p><a href="{reset_link}">{reset_link}</a></p>
                <p>If you did not request this, please ignore this email.</p>
                <br>
                <p>Best regards,<br>The EraMatch Team</p>
            </body>
        </html>
        """
        await EmailService.send_email_async(subject, email, html)

    @staticmethod
    async def send_offer_email(email: str, name: str, position_title: str):
        """Sent when a candidate receives a final offer."""
        subject = f"Congratulations! EraMatch Offer for {position_title}"
        html = f"""
        <html>
            <body>
                <h2>Congratulations {name}!</h2>
                <p>We are thrilled to extend you an offer for the position of <strong>{position_title}</strong>.</p>
                <p>Please log in to your Candidate Portal to review the details of your offer and provide your decision.</p>
                <p>We look forward to welcoming you to the team!</p>
                <br>
                <p>Best regards,<br>The EraMatch Recruiting Team</p>
            </body>
        </html>
        """
        await EmailService.send_email_async(subject, email, html)

    @staticmethod
    async def send_group_credentials_email(
        email: str, name: str, group_name: str,
        temp_password: str, group_id: str
    ):
        """Sent when a candidate is added to a new group with fresh credentials."""
        login_url = f"https://eramatch.com/login/{group_id}"
        subject = f"EraMatch - Your New Group Credentials"
        html = f"""
        <html>
            <body>
                <h2>Hello {name},</h2>
                <p>You have been added to a new candidate group: <strong>{group_name}</strong>.</p>
                <p>Your login credentials for this group are:</p>
                <table style="border-collapse: collapse; margin: 16px 0;">
                    <tr>
                        <td style="padding: 8px 16px; border: 1px solid #ddd; font-weight: bold;">Email</td>
                        <td style="padding: 8px 16px; border: 1px solid #ddd;"><code>{email}</code></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 16px; border: 1px solid #ddd; font-weight: bold;">Password</td>
                        <td style="padding: 8px 16px; border: 1px solid #ddd;"><code>{temp_password}</code></td>
                    </tr>
                </table>
                <p>Use the following link to log in:</p>
                <p><a href="{login_url}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: #fff; text-decoration: none; border-radius: 6px;">Log In to Your Portal</a></p>
                <p>Please keep these credentials safe. For security, we recommend changing your password upon first login.</p>
                <br>
                <p>Best regards,<br>The EraMatch Recruiting Team</p>
            </body>
        </html>
        """
        await EmailService.send_email_async(subject, email, html)
