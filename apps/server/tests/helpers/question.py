from uuid import uuid4

from riva.agents.practice.question_types import QuestionGenerationInput


def valid_question_generation_input(language: str = "zh-CN") -> QuestionGenerationInput:
    work_id = uuid4()
    project_id = uuid4()
    return QuestionGenerationInput.model_validate(
        {
            "interaction_language": language,
            "question_type": "projectDeepDive",
            "difficulty": "basic",
            "target_role": {
                "id": str(uuid4()),
                "title": "Backend Engineer",
                "company": "Example Labs",
                "recruitment_type": "experienced",
                "location": "Shanghai",
            },
            "career_profile": {
                "education": [
                    {
                        "school": "Tongji University",
                        "degree": "Bachelor's degree",
                        "major": "Software Engineering",
                    }
                ],
                "work_experiences": [
                    {
                        "id": str(work_id),
                        "company": "Riva",
                        "title": "Backend Engineer",
                        "responsibilities": ["Designed payment APIs"],
                        "achievements": ["Improved API reliability"],
                        "skills": ["Python", "FastAPI"],
                    }
                ],
                "project_experiences": [
                    {
                        "id": str(project_id),
                        "name": "Payment API",
                        "role": "Backend owner",
                        "responsibilities": ["Designed the service boundary"],
                        "achievements": ["Reduced payment failures"],
                        "skills": ["Python", "PostgreSQL"],
                    }
                ],
                "skills": ["Python", "FastAPI", "PostgreSQL"],
            },
            "job_description_analysis": {
                "role_title": "Backend Engineer",
                "company": "Example Labs",
                "riva_summary": "Build reliable payment services.",
                "responsibilities": ["Design and operate backend APIs"],
                "qualification_requirements": {
                    "education": ["Bachelor's degree"],
                    "graduation_cohorts": [],
                    "majors": ["Computer Science or related field"],
                    "experience": ["Backend service experience"],
                    "languages": [],
                    "certifications": [],
                    "other": [],
                },
                "required_skills": {
                    "programming_languages": ["Python"],
                    "frameworks_and_libraries": ["FastAPI"],
                    "platforms": [],
                    "tools": [],
                    "concepts_and_methods": ["Distributed systems"],
                    "databases_and_middleware": ["PostgreSQL"],
                    "other": [],
                },
                "preferred_qualifications": [],
                "soft_skills": ["Clear communication"],
                "business_domains": ["Payments"],
            },
            "matching_analysis": {
                "overall_match_score": 78,
                "core_requirements_summary": "Reliable payment APIs with Python.",
                "matched_capabilities": ["Python", "FastAPI"],
                "missing_capabilities": ["Kubernetes"],
                "underrepresented_capabilities": ["System design"],
                "resume_highlights": ["Improved API reliability"],
                "resume_gaps": ["Scale is not quantified"],
                "high_risk_questions": ["How did you improve reliability?"],
                "preparation_recommendations": ["Prepare the reliability example."],
            },
        }
    )


def valid_question_generation_output(
    input: QuestionGenerationInput,
) -> dict[str, object]:
    project_id = input.career_profile.project_experiences[0].id
    return {
        "prompt": "Explain how you designed the payment service boundary.",
        "question_type": input.question_type.value,
        "difficulty": input.difficulty.value,
        "assessed_capabilities": ["Technical decision-making", "Personal contribution"],
        "recommended_materials": [
            {
                "type": "projectExperience",
                "id": str(project_id),
                "label": "An untrusted label",
                "reason": "Shows a relevant service design decision.",
            }
        ],
        "answer_hints": ["Explain your own responsibility."],
        "answer_framework": ["Context and goal", "Decision and trade-off", "Result"],
        "follow_up_directions": ["Technical rationale"],
        "scoring_focus": ["Whether the personal contribution is explicit"],
    }
