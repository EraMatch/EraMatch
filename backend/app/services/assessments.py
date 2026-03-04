import json
from uuid import UUID
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import (
    Assessment,
    AssessmentSection,
    QuestionBank,
    SectionQuestionPool,
    QuestionType
)
from app.schemas.assessments import AssessmentCreateRequest, SectionCreate, QuestionCreate

class AssessmentService:
    def __init__(self, session: Session):
        self.session = session

    async def create_assessment(self, request_data: AssessmentCreateRequest, user_id: UUID, organization_id: UUID) -> Assessment:
        try:
            # 1. Create Assessment Record
            # Combine basic settings with specific fields from the request
            assessment = Assessment(
                organization_id=organization_id,
                position_id=request_data.position_id,
                group_id=request_data.group_id,
                title=request_data.title,
                description=request_data.description,
                duration_minutes=request_data.duration_minutes,
                passing_score=request_data.passing_score,
                shuffle_sections=request_data.randomize_questions, # Map frontend setting to backend field
                anti_cheating_enabled=request_data.proctoring,       # Map frontend setting to backend field
                status="draft", # Newly created assessments start as draft
                created_by_user_id=user_id
            )
            
            self.session.add(assessment)
            await self.session.flush() # Flush to get the assessment id

            # 2. Iterate through sections and questions
            for section_data in request_data.sections:
                # Validate enum mapping for section type
                section_type_mapping = {
                    "mcq": QuestionType.MCQ,
                    "essay": QuestionType.ESSAY,
                    "code": QuestionType.CODING
                }
                db_section_type = section_type_mapping.get(section_data.type, QuestionType.MCQ)

                section = AssessmentSection(
                    assessment_id=assessment.id,
                    section_order=section_data.order,
                    section_title=f"Section {section_data.order}", # Using a default title as none was provided by the frontend payload mapping
                    question_type=db_section_type,
                    variants_to_select=len(section_data.variants), # By default, selecting all created variants
                    points_per_question=section_data.points,
                    selection_strategy=section_data.selectionStrategy
                )
                self.session.add(section)
                await self.session.flush()

                # Iterate through variants in the section
                for variant_idx, variant_data in enumerate(section_data.variants):
                    # Prepare question_config based on type
                    question_config = {}
                    correct_answer_payload = None
                    
                    if variant_data.type == "mcq":
                        question_config = {
                            "options": variant_data.options,
                            "explanation": variant_data.explanation,
                            "multipleCorrect": variant_data.multipleCorrect
                        }
                        
                        # Assuming single correct answer for now as per instructions "leave multiple correct answers for now"
                        # Handle array or int representing correct answer from frontend
                        if isinstance(variant_data.correctAnswer, list) and len(variant_data.correctAnswer) > 0:
                             correct_idx = variant_data.correctAnswer[0]
                             correct_text = variant_data.options[correct_idx] if variant_data.options and len(variant_data.options) > correct_idx else ""
                             correct_answer_payload = {"correct_text": correct_text, "correct_index": correct_idx}
                        elif isinstance(variant_data.correctAnswer, int):
                             correct_idx = variant_data.correctAnswer
                             correct_text = variant_data.options[correct_idx] if variant_data.options and len(variant_data.options) > correct_idx else ""
                             correct_answer_payload = {"correct_text": correct_text, "correct_index": correct_idx}
                             
                    elif variant_data.type == "essay":
                         question_config = {
                             "rubric": variant_data.rubric,
                             "max_words": variant_data.maxWords,
                             "expected_keywords": variant_data.expectedKeywords,
                             "explanation": variant_data.explanation
                         }
                    elif variant_data.type == "code":
                         question_config = {
                             "language": variant_data.language,
                             "time_limit": variant_data.timeLimit,
                             "memory_limit": variant_data.memoryLimit,
                             "test_cases": variant_data.testCases,
                             "starter_code": variant_data.codeTemplate,
                             "explanation": variant_data.explanation
                         }

                    # Map difficulty
                    difficulty_mapping = {"Easy": 1, "Medium": 2, "Hard": 3}
                    difficulty_val = difficulty_mapping.get(variant_data.difficulty, 2)

                    variant_id = variant_data.id
                    is_valid_uuid = False
                    try:
                        parsed_uuid = UUID(variant_id)
                        is_valid_uuid = True
                    except Exception:
                        pass
                    
                    question = None
                    if is_valid_uuid:
                        q_check = await self.session.execute(
                            select(QuestionBank).where(
                                QuestionBank.id == parsed_uuid, 
                                QuestionBank.organization_id == organization_id
                            )
                        )
                        question = q_check.scalars().first()
                        if question:
                            question.usage_count += 1
                            self.session.add(question)

                    if not question:
                        # Create Question in QuestionBank
                        question = QuestionBank(
                            organization_id=organization_id,
                            question_type=db_section_type,
                            question_text=variant_data.questionText,
                            question_config=question_config,
                            correct_answer=correct_answer_payload,
                            category=variant_data.category,
                            difficulty=difficulty_val,
                            tags=variant_data.tags,
                            points=variant_data.points,
                            created_by_user_id=user_id,
                            usage_count=1 # Initial use
                        )
                        self.session.add(question)
                        await self.session.flush()

                    # Link Question to Section Pool
                    pool_entry = SectionQuestionPool(
                        section_id=section.id,
                        question_id=question.id,
                        variant_order=variant_idx + 1,
                        is_active=True
                    )
                    self.session.add(pool_entry)
            
            # Commit the transaction after everything is staged successfully
            await self.session.commit()
            await self.session.refresh(assessment)
            return assessment

        except Exception as e:
            await self.session.rollback()
            # Log the original error internally, return general error to user.
            print(f"Error creating assessment transaction: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to create assessment: {str(e)}")

    async def get_assessment(self, assessment_id: UUID, organization_id: UUID) -> dict:
        q = select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.organization_id == organization_id,
            Assessment.is_deleted == False
        )
        res = await self.session.execute(q)
        assessment = res.scalars().first()
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")

        # Load sections and questions
        sections_q = select(AssessmentSection).where(AssessmentSection.assessment_id == assessment_id).order_by(AssessmentSection.section_order)
        sections_res = await self.session.execute(sections_q)
        sections = sections_res.scalars().all()

        formatted_sections = []
        for sec in sections:
            # Load questions for this section
            pools_q = select(SectionQuestionPool).where(SectionQuestionPool.section_id == sec.id).order_by(SectionQuestionPool.variant_order)
            pools_res = await self.session.execute(pools_q)
            pools = pools_res.scalars().all()
            question_ids = [p.question_id for p in pools]

            variants = []
            if question_ids:
                questions_q = select(QuestionBank).where(QuestionBank.id.in_(question_ids))
                questions_res = await self.session.execute(questions_q)
                question_map = {q.id: q for q in questions_res.scalars().all()}
                
                # Maintain order
                for pool in pools:
                    qbank = question_map.get(pool.question_id)
                    if qbank:
                        diff_mapping = {1: "Easy", 2: "Medium", 3: "Hard"}
                        # Map backend type to frontend type
                        bg_type = qbank.question_type
                        if isinstance(bg_type, QuestionType):
                            bg_type = bg_type.value
                        frontend_type = "code" if bg_type == "coding" else bg_type
                        
                        variants.append({
                            "id": str(qbank.id),
                            "type": frontend_type,
                            "questionText": qbank.question_text,
                            "category": qbank.category or "",
                            "difficulty": diff_mapping.get(qbank.difficulty, "Medium"),
                            "tags": qbank.tags or [],
                            "points": qbank.points or 10,
                            "options": qbank.question_config.get("options") if qbank.question_config else None,
                            "correctAnswer": qbank.correct_answer.get("correct_index") if qbank.correct_answer and "correct_index" in qbank.correct_answer else (qbank.correct_answer.get("answer") if qbank.correct_answer else None),
                            "multipleCorrect": qbank.question_config.get("multiple_correct", False) if qbank.question_config else False,
                            "explanation": qbank.question_config.get("explanation") if qbank.question_config else None,
                            "language": qbank.question_config.get("language") if qbank.question_config else None,
                            "timeLimit": qbank.question_config.get("time_limit") if qbank.question_config else None,
                            "memoryLimit": qbank.question_config.get("memory_limit") if qbank.question_config else None,
                            "codeTemplate": qbank.question_config.get("starter_code") if qbank.question_config else None,
                            "testCases": qbank.question_config.get("test_cases") if qbank.question_config else None,
                            "maxWords": qbank.question_config.get("max_words") if qbank.question_config else None,
                            "expectedKeywords": qbank.question_config.get("expected_keywords") if qbank.question_config else None,
                            "rubric": qbank.question_config.get("rubric") if qbank.question_config else None
                        })

            sec_bg_type = sec.question_type
            if isinstance(sec_bg_type, QuestionType):
                sec_bg_type = sec_bg_type.value
            sec_frontend_type = "code" if sec_bg_type == "coding" else sec_bg_type

            formatted_sections.append({
                "id": str(sec.id),
                "order": sec.section_order,
                "type": sec_frontend_type,
                "variants": variants,
                "points": sec.points_per_question,
                "selectionStrategy": sec.selection_strategy
            })

        return {
            "id": str(assessment.id),
            "config": {
                "title": assessment.title,
                "description": assessment.description or "",
                "duration": assessment.duration_minutes,
                "passingScore": assessment.passing_score,
                "difficulty": "Medium",
                "randomizeQuestions": assessment.shuffle_sections,
                "showResults": False,
                "allowReview": False,
                "proctoring": assessment.anti_cheating_enabled
            },
            "sections": formatted_sections
        }

    async def update_assessment(self, assessment_id: UUID, request_data: AssessmentCreateRequest, user_id: UUID, organization_id: UUID) -> Assessment:
        try:
            q = select(Assessment).where(
                Assessment.id == assessment_id,
                Assessment.organization_id == organization_id,
                Assessment.is_deleted == False
            )
            res = await self.session.execute(q)
            assessment = res.scalars().first()
            if not assessment:
                raise HTTPException(status_code=404, detail="Assessment not found")

            assessment.title = request_data.title
            assessment.description = request_data.description
            assessment.duration_minutes = request_data.duration_minutes
            assessment.passing_score = request_data.passing_score
            assessment.shuffle_sections = request_data.randomize_questions
            assessment.anti_cheating_enabled = request_data.proctoring

            # Delete existing sections and pools
            sections_q = select(AssessmentSection).where(AssessmentSection.assessment_id == assessment_id)
            sections_res = await self.session.execute(sections_q)
            sections = sections_res.scalars().all()
            for sec in sections:
                pools_q = select(SectionQuestionPool).where(SectionQuestionPool.section_id == sec.id)
                pools_res = await self.session.execute(pools_q)
                pools = pools_res.scalars().all()
                for pool in pools:
                    await self.session.delete(pool)
                await self.session.delete(sec)
                
            await self.session.flush()

            # Re-create sections and questions using the same logic
            for section_data in request_data.sections:
                section_type_mapping = {
                    "mcq": QuestionType.MCQ,
                    "essay": QuestionType.ESSAY,
                    "code": QuestionType.CODING
                }
                db_section_type = section_type_mapping.get(section_data.type, QuestionType.MCQ)

                section = AssessmentSection(
                    assessment_id=assessment.id,
                    section_order=section_data.order,
                    section_title=f"Section {section_data.order}",
                    question_type=db_section_type,
                    variants_to_select=len(section_data.variants),
                    points_per_question=section_data.points,
                    selection_strategy=section_data.selectionStrategy
                )
                self.session.add(section)
                await self.session.flush()

                for variant_idx, variant_data in enumerate(section_data.variants):
                    question_config = {}
                    correct_answer_payload = None
                    
                    if variant_data.type == "mcq":
                        question_config = {
                            "options": variant_data.options,
                            "explanation": variant_data.explanation,
                            "multipleCorrect": variant_data.multipleCorrect
                        }
                        
                        if isinstance(variant_data.correctAnswer, list) and len(variant_data.correctAnswer) > 0:
                             correct_idx = variant_data.correctAnswer[0]
                             correct_text = variant_data.options[correct_idx] if variant_data.options and len(variant_data.options) > correct_idx else ""
                             correct_answer_payload = {"correct_text": correct_text, "correct_index": correct_idx}
                        elif isinstance(variant_data.correctAnswer, int):
                             correct_idx = variant_data.correctAnswer
                             correct_text = variant_data.options[correct_idx] if variant_data.options and len(variant_data.options) > correct_idx else ""
                             correct_answer_payload = {"correct_text": correct_text, "correct_index": correct_idx}
                             
                    elif variant_data.type == "essay":
                         question_config = {
                             "rubric": variant_data.rubric,
                             "max_words": variant_data.maxWords,
                             "expected_keywords": variant_data.expectedKeywords,
                             "explanation": variant_data.explanation
                         }
                    elif variant_data.type == "code":
                         question_config = {
                             "language": variant_data.language,
                             "time_limit": variant_data.timeLimit,
                             "memory_limit": variant_data.memoryLimit,
                             "test_cases": variant_data.testCases,
                             "starter_code": variant_data.codeTemplate,
                             "explanation": variant_data.explanation
                         }

                    difficulty_mapping = {"Easy": 1, "Medium": 2, "Hard": 3}
                    difficulty_val = difficulty_mapping.get(variant_data.difficulty, 2)

                    variant_id = variant_data.id
                    is_valid_uuid = False
                    try:
                        parsed_uuid = UUID(variant_id)
                        is_valid_uuid = True
                    except Exception:
                        pass
                    
                    question = None
                    if is_valid_uuid:
                        q_check = await self.session.execute(
                            select(QuestionBank).where(
                                QuestionBank.id == parsed_uuid, 
                                QuestionBank.organization_id == organization_id
                            )
                        )
                        question = q_check.scalars().first()
                        if question:
                            question.usage_count += 1
                            self.session.add(question)

                    if not question:
                        question = QuestionBank(
                            organization_id=organization_id,
                            question_type=db_section_type,
                            question_text=variant_data.questionText,
                            question_config=question_config,
                            correct_answer=correct_answer_payload,
                            category=variant_data.category,
                            difficulty=difficulty_val,
                            tags=variant_data.tags,
                            points=variant_data.points,
                            created_by_user_id=user_id,
                            usage_count=1
                        )
                        self.session.add(question)
                        await self.session.flush()

                    pool_entry = SectionQuestionPool(
                        section_id=section.id,
                        question_id=question.id,
                        variant_order=variant_idx + 1,
                        is_active=True
                    )
                    self.session.add(pool_entry)
            
            await self.session.commit()
            await self.session.refresh(assessment)
            return assessment

        except Exception as e:
            await self.session.rollback()
            print(f"Error updating assessment transaction: {e}")
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Failed to update assessment: {str(e)}")

    async def delete_assessment(self, assessment_id: UUID, organization_id: UUID) -> bool:
        q = select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.organization_id == organization_id,
            Assessment.is_deleted == False
        )
        res = await self.session.execute(q)
        assessment = res.scalars().first()
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")

        assessment.is_deleted = True
        await self.session.commit()
        return True
