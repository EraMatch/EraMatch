import logging
from uuid import UUID
from worker.celery_app import celery_app
from app.db.session import SessionLocal
from app.models import QuestionBank, QuestionImportJob
from app.integrations.llm import get_llm
import json
from langchain_core.prompts import PromptTemplate

logger = logging.getLogger(__name__)

PROMPTS = {
    "rubric": """You are an expert AI creating technical assessments.
The following essay question is missing a grading rubric.
Please provide a comprehensive Grading Rubric explaining how to evaluate the candidate's answer.

Question: {question_text}
Reference Answer (if any): {reference_answer}

Provide your response strictly as JSON with the following schema:
{{
  "rubric": "Detailed grading rubric explaining how to evaluate..."
}}
""",
    "checks": """You are an expert AI creating technical assessments.
The following essay question is missing automatic evaluation Yes/No checks.
Please provide exactly 10 Yes/No checks that can be used to automatically score a candidate's answer.

Question: {question_text}
Reference Answer (if any): {reference_answer}
Rubric (if any): {rubric}

Provide your response strictly as JSON with the following schema:
{{
  "yes_no_checks": [
    {{ "check": "Does the answer explain X?", "weight": 0.1 }},
    ... (exactly 10 checks, weights must sum to 1.0)
  ]
}}
""",
    "answer": """You are an expert AI creating technical assessments.
The following essay question is missing a model reference answer.
Please provide a high-quality model reference answer to the question.

Question: {question_text}
Rubric (if any): {rubric}

Provide your response strictly as JSON with the following schema:
{{
  "reference_answer": "A comprehensive model answer to the question..."
}}
""",
    "all": """You are an expert AI creating technical assessments.
The following is an incomplete essay question. Please analyze it and provide the missing components.
Make sure to provide a comprehensive Grading Rubric, exactly 10 Yes/No checks for automatic evaluation, and a high-quality model reference answer.

Question: {question_text}

Provide your response strictly as JSON with the following schema:
{{
  "rubric": "Detailed grading rubric explaining how to evaluate...",
  "reference_answer": "A comprehensive model answer to the question...",
  "yes_no_checks": [
    {{ "check": "Does the answer explain X?", "weight": 0.1 }},
    ... (exactly 10 checks, weights must sum to 1.0)
  ]
}}
"""
}

@celery_app.task(name="worker.tasks.question_refactor.refactor_questions_batch")
def refactor_questions_batch(job_id: str, question_ids_str: list[str], org_id: str, refactor_type: str = "all"):
    logger.info(f"Starting refactor for job {job_id}, {len(question_ids_str)} questions, type: {refactor_type}")
    llm = get_llm("ollama")

    prompt_template = PROMPTS.get(refactor_type, PROMPTS["all"])
    prompt = PromptTemplate.from_template(prompt_template)
    chain = prompt | llm

    with SessionLocal() as session:
        job = session.get(QuestionImportJob, UUID(job_id))
        if not job:
            logger.error(f"Job {job_id} not found")
            return
            
        job.status = "processing"
        session.commit()
        
        drafts = []
        success_count = 0

        for qid_str in question_ids_str:
            try:
                question = session.get(QuestionBank, UUID(qid_str))
                if not question or str(question.organization_id) != org_id:
                    continue

                logger.info(f"Refactoring question {question.id}")
                
                config = question.question_config or {}
                
                # Format prompt variables
                variables = {
                    "question_text": question.question_text,
                    "reference_answer": config.get("reference_answer", "None provided"),
                    "rubric": config.get("rubric", "None provided")
                }
                
                response = chain.invoke(variables)
                
                raw_text = response.content.strip()
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                
                data = json.loads(raw_text)
                
                # Create draft dict inheriting from the original
                draft = {
                    "original_question_id": str(question.id),
                    "type": "Essay", # Assuming essay since refactor is for essays
                    "text": question.question_text,
                    "difficulty": ["Easy", "Medium", "Hard"][question.difficulty - 1] if question.difficulty else "Medium",
                    "category": question.category or "General",
                    "tags": question.tags or [],
                    "evidence": config.get("evidence"),
                    "reference_answer": data.get("reference_answer", config.get("reference_answer")),
                    "rubric": data.get("rubric", config.get("rubric")),
                    "rubric_yes_no_checks": data.get("yes_no_checks", config.get("rubricYesNoChecks")),
                    "max_words": config.get("max_words", 500)
                }
                
                drafts.append(draft)
                success_count += 1
                logger.info(f"Successfully refactored {question.id}")
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON for question {qid_str}: {e}")
            except Exception as e:
                logger.error(f"Error processing question {qid_str}: {e}")
                
        # Update Job
        job.status = "completed"
        job.total_generated = success_count
        job.draft_questions = drafts
        session.add(job)
        session.commit()
        logger.info(f"Refactoring job {job_id} completed. Generated {success_count} drafts.")
