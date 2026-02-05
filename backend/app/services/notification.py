from uuid import UUID
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models import Notification, EmailLog
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_notification(
        self, 
        organization_id: UUID, 
        recipient_user_id: UUID, 
        title: str, 
        message: str, 
        notification_type: str = "assignment",
        data: dict = None
    ):
        """Create an in-app notification via DB."""
        try:
            notification = Notification(
                organization_id=organization_id,
                recipient_user_id=recipient_user_id,
                type=notification_type,
                title=title,
                message=message,
                data=data or {},
                is_read=False
            )
            self.session.add(notification)
            await self.session.commit()
            return True
        except Exception as e:
            logger.error(f"Error creating notification: {e}")
            await self.session.rollback()
            return False

    async def send_notification_email(
        self, 
        organization_id: UUID, 
        recipient_email: str, 
        subject: str, 
        message_body: str,
        template_type: str = "assignment_notification"
    ):
        """Log an email sending action via DB and print to console."""
        try:
            # Log to DB
            email_log = EmailLog(
                organization_id=organization_id,
                recipient_email=recipient_email,
                subject=subject,
                template_type=template_type,
                status="sent",
                sent_at=datetime.utcnow()
            )
            self.session.add(email_log)
            await self.session.commit()

            # Simulate sending (print to console)
            logger.info("\n" + "="*50)
            logger.info(f"EMAIL SENT TO: {recipient_email}")
            logger.info(f"SUBJECT: {subject}")
            logger.info(f"BODY: {message_body}")
            logger.info("="*50 + "\n")
            
            return True
        except Exception as e:
            logger.error(f"Error logging email: {e}")
            await self.session.rollback()
            return False
