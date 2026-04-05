from __future__ import annotations
from typing import List
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, delete, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundException
from app.models import QuestionBank, QuestionBankFavorite, User
from app.schemas.questions import QuestionBankCreateRequest, QuestionBankResponseItem

class QuestionService:
    def __init__(self, session: AsyncSession, current_user: User):
        self.session = session
        self.user = current_user
        self.org_id = current_user.organization_id

    async def get_question_bank(self) -> List[QuestionBankResponseItem]:
        """
        Fetch all available base questions for the organization.
        Filters out soft-deleted and non-base questions.
        """
        q = (
            select(QuestionBank)
            .where(
                QuestionBank.organization_id == self.org_id,
                QuestionBank.is_base_question == True,
                QuestionBank.is_deleted == False
            )
            .order_by(QuestionBank.created_at.desc())
        )
        res = await self.session.execute(q)
        questions = res.scalars().all()

        if not questions:
            return []

        # Fetch Favorites for current user
        q_favs = select(QuestionBankFavorite.question_id).where(
            QuestionBankFavorite.user_id == self.user.id
        )
        favs_res = await self.session.execute(q_favs)
        favorite_ids = set(favs_res.scalars().all())

        response_items = []
        # DB Mappings
        diff_map = {1: "Easy", 2: "Medium", 3: "Hard"}
        type_map = {"mcq": "Multiple Choice", "essay": "Essay", "code": "Code"}

        for qb in questions:
            # Map specific config fields to root response items
            config = qb.question_config or {}
            
            diff_str = diff_map.get(qb.difficulty, "Medium")
            type_str = type_map.get(qb.question_type, "Multiple Choice")

            # Form specific settings from `question_config` and `correct_answer`
            raw_options = config.get("options")
            processed_options = []
            if raw_options and isinstance(raw_options, list):
                for opt in raw_options:
                    if isinstance(opt, dict):
                        processed_options.append(opt.get("text", str(opt)))
                    else:
                        processed_options.append(str(opt))
            else:
                processed_options = raw_options if raw_options is not None else []

            item = QuestionBankResponseItem(
                id=qb.id,
                text=qb.question_text,
                category=qb.category or "Uncategorized",
                difficulty=diff_str,
                type=type_str,
                tags=qb.tags or [],
                usageCount=qb.usage_count,
                avgScore=0,  # Could aggregate from CandidateAnswer if needed
                createdAt=qb.created_at.strftime("%Y-%m-%d"),
                createdBy="You" if qb.created_by_user_id == self.user.id else "System",
                isFavorite=qb.id in favorite_ids,

                # Form specific settings from processed options
                options=processed_options,
                correctAnswer=qb.correct_answer.get("answer") if qb.correct_answer else None,
                multipleCorrect=config.get("multiple_correct", False),
                explanation=config.get("explanation"),
                codeLanguage=config.get("language"),
                codeTemplate=config.get("code_template"),
                testCases=config.get("test_cases"),
                timeLimit=config.get("time_limit"),
                memoryLimit=config.get("memory_limit"),
                maxWords=config.get("max_words"),
                expectedKeywords=config.get("expected_keywords"),
                rubric=config.get("rubric"),
                evidence=config.get("evidence"),
                referenceAnswer=config.get("reference_answer"),
                rubricYesNoChecks=config.get("rubric_yes_no_checks"),
                needsReview=config.get("needs_review"),
                criticScore=config.get("critic_score"),
                criticWeightedScore=config.get("critic_weighted_score"),
                criticFeedback=config.get("critic_feedback"),
                criticChecks=config.get("critic_checks"),
                retryCount=config.get("retry_count"),
                importType=config.get("import_type"),
                importJobId=config.get("import_job_id"),
                sourceFilename=config.get("source_filename")
            )
            response_items.append(item)
        
        return response_items

    async def create_question(self, data: QuestionBankCreateRequest) -> QuestionBankResponseItem:
        """
        Creates a new base question and enters it into the Question Bank.
        """
        # Convert frontend difficulty string payload to DB Int
        diff_map = {"Easy": 1, "Medium": 2, "Hard": 3}
        diff_int = diff_map.get(data.difficulty, 2)

        # Normalize type
        q_type = data.type
        if q_type == "Multiple Choice":
            q_type = "mcq"
        elif q_type == "Essay":
            q_type = "essay"
        elif q_type == "Code":
            q_type = "code"

        config = {}
        correct_answer = None

        # Shared metadata fields used by review/approval workflows.
        config["evidence"] = data.evidence
        config["reference_answer"] = data.referenceAnswer
        config["rubric_yes_no_checks"] = data.rubricYesNoChecks
        config["needs_review"] = data.needsReview
        config["critic_score"] = data.criticScore
        config["critic_weighted_score"] = data.criticWeightedScore
        config["critic_feedback"] = data.criticFeedback
        config["critic_checks"] = data.criticChecks
        config["retry_count"] = data.retryCount

        if q_type == "mcq":
            config["options"] = data.options
            config["multiple_correct"] = data.multipleCorrect
            config["explanation"] = data.explanation
            if data.correctAnswer is not None:
                correct_answer = {"answer": data.correctAnswer}
        elif q_type == "code":
            config["language"] = data.codeLanguage
            config["code_template"] = data.codeTemplate
            config["test_cases"] = data.testCases
            config["time_limit"] = data.timeLimit
            config["memory_limit"] = data.memoryLimit
        elif q_type == "essay":
            config["max_words"] = data.maxWords
            config["expected_keywords"] = data.expectedKeywords
            config["rubric"] = data.rubric

        new_question = QuestionBank(
            organization_id=self.org_id,
            question_type=q_type,
            question_text=data.text,
            question_config=config,
            correct_answer=correct_answer,
            category=data.category or "Uncategorized", 
            difficulty=diff_int,
            tags=data.tags or [],
            points=10, # default
            created_by_user_id=self.user.id,
            is_base_question=True,
            is_deleted=False
        )

        self.session.add(new_question)
        await self.session.commit()
        await self.session.refresh(new_question)

        # Return identical response item so UI updates nicely
        return QuestionBankResponseItem(
            id=new_question.id,
            text=new_question.question_text,
            category=new_question.category,
            difficulty=data.difficulty or "Medium",
            type=data.type,
            tags=new_question.tags or [],
            usageCount=0,
            avgScore=0,
            createdAt=new_question.created_at.strftime("%Y-%m-%d"),
            createdBy="You",
            isFavorite=False,
            options=data.options,
            correctAnswer=data.correctAnswer,
            multipleCorrect=data.multipleCorrect,
            explanation=data.explanation,
            codeLanguage=data.codeLanguage,
            codeTemplate=data.codeTemplate,
            testCases=data.testCases,
            timeLimit=data.timeLimit,
            memoryLimit=data.memoryLimit,
            maxWords=data.maxWords,
            expectedKeywords=data.expectedKeywords,
            rubric=data.rubric,
            evidence=data.evidence,
            referenceAnswer=data.referenceAnswer,
            rubricYesNoChecks=data.rubricYesNoChecks,
            needsReview=data.needsReview,
            criticScore=data.criticScore,
            criticWeightedScore=data.criticWeightedScore,
            criticFeedback=data.criticFeedback,
            criticChecks=data.criticChecks,
            retryCount=data.retryCount,
            importType=None,
            importJobId=None,
            sourceFilename=None
        )

    async def toggle_favorite(self, question_id: UUID) -> bool:
        """
        Toggles the favorite status for a question for the current user.
        Returns the new state. True if favorited, False if unfavorited.
        """
        # Verify question exists and is base
        q = await self.session.execute(
            select(QuestionBank).where(
                QuestionBank.id == question_id,
                QuestionBank.organization_id == self.org_id,
                QuestionBank.is_deleted == False
            )
        )
        q_bank = q.scalars().first()
        if not q_bank:
            raise NotFoundException("Question not found")

        # Check existing favorite
        fav_q = await self.session.execute(
            select(QuestionBankFavorite).where(
                QuestionBankFavorite.question_id == question_id,
                QuestionBankFavorite.user_id == self.user.id
            )
        )
        fav = fav_q.scalars().first()

        if fav:
            # Delete if exists
            await self.session.delete(fav)
            await self.session.commit()
            return False
        else:
            # Create if not exists
            new_fav = QuestionBankFavorite(
                question_id=question_id,
                user_id=self.user.id
            )
            self.session.add(new_fav)
            await self.session.commit()
            return True

    async def delete_question(self, question_id: UUID) -> None:
        """
        Soft deletes a question from the bank.
        """
        q = await self.session.execute(
            select(QuestionBank).where(
                QuestionBank.id == question_id,
                QuestionBank.organization_id == self.org_id
            )
        )
        qb = q.scalars().first()
        if not qb:
            raise NotFoundException("Question not found")
        
        qb.is_deleted = True
        self.session.add(qb)
        await self.session.commit()
