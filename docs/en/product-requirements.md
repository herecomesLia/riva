# Product Requirements

## Feature Overview

Riva is an AI interview training assistant for job seekers. Based on the user's resume, target roles, and practice performance, it supports interview preparation through job understanding, resume-to-role matching, personalized question cards, targeted practice, mock interviews, scoring, reviews, and training recommendations. The goal is to help users prepare more effectively and improve the quality of their interview responses.

Across the user's journey from building a job search profile and understanding a target role to practicing interviews and reviewing performance, Riva's capabilities can be grouped into five areas:

- **Job Search Profile Management**: Maintains resumes, education experience, work experience, project experience, skill tags, target roles, and job search direction as the foundation for personalized analysis and training.
- **Job understanding and matching**: Parses target JDs, extracts responsibilities, capability requirements, business context, and high-frequency keywords, then generates a resume-to-role matching analysis.
- **Question Cards and Single-Question Practice**: Uses question cards as the smallest training unit and supports personalized question generation, single-question practice, dynamic follow-up questions, scoring, and single-question reviews.
- **Targeted Practice and Mock Interviews**: Provides targeted practice and mock interviews for two scenarios: quick single-question improvement and continuous multi-question interview rehearsal.
- **Training records and recommendations**: Stores user answers, follow-up questions, scores, reviews, weak areas, and recommendation results to support later question generation, training suggestions, and review improvements.

## Table of Contents

- [Job Search Profile Management](#job-search-profile-management)
- [Job Understanding and Matching](#job-understanding-and-matching)
- [Question Cards and Single-Question Practice](#question-cards-and-single-question-practice)
- [Targeted Practice and Mock Interviews](#targeted-practice-and-mock-interviews)
- [Training Records and Recommendations](#training-records-and-recommendations)
- [Language consistency / Interaction Language](#language-consistency--interaction-language)

## Language consistency / Interaction Language

RIVA's core language rule is: every user-visible AI artifact produced during the
current interaction or training uses the language selected by the user. The current
supported values are `zh-CN` and `en`, with `zh-CN` as the default. This covers resume
parsing, JD parsing, matching analysis, questions and QuestionCards, answering hints,
example answers, dynamic follow-ups, scoring, single-question reviews, weak-area
explanations, next-question recommendations, targeted practice, mock interviews,
candidate-question feedback, full-session reviews, and all human-readable RIVA
content stored in training records.

### Three language meanings

1. **UI language** is the current interface language and can change at any time. Real
   API requests default to the normalized current language in `Accept-Language`.
2. **Artifact language** is the frozen language of one independent AI result. Resume
   Parsing, JD Parsing, Matching Analysis, and future independent QuestionCard
   generation capture the current UI language when the Agent is invoked and
   store it as `interactionLanguage` with the resulting business artifact.
3. **Session language** is business metadata for continuous training. A
   `PracticeSession` or `InterviewSession` captures and persists the current UI
   language at creation; every QuestionCard, Question Generation, Follow-up,
   Evaluation, Review, and Recommendation in that session inherits it.

Changing the UI language affects navigation, buttons, and other fixed UI copy only.
It does not change an existing artifact or the questions, follow-ups, feedback, or
review of an active Session. The next newly created training Session uses the new UI
language. Historical AI artifacts, training records, and interview records are not
automatically translated; another language requires an explicit regenerate lifecycle.

### Output language and evidence boundary

Natural-language descriptions use the interaction language. Company, school, project,
product, skill, programming-language, framework, database, protocol, standard, and
URL entities should remain in their original form where practical. For example, a
Chinese interaction may say “负责使用 Python 和 FastAPI 开发后端 API” without
translating the technical names. Language conversion must not add, remove, or change
facts. Raw user resumes, raw JDs, and user answers are stored as entered and are not
automatically translated by RIVA.

Every new user-visible AI workflow must declare its language source: an independent
artifact uses the language captured for its Agent invocation, and a Session child
operation uses its owning Session's `language`. Agent prompts must not use “detect the primary language and
choose the output language” as their main strategy; a default of `zh-CN` is allowed
only for historical compatibility data that lacks a language.

### Current Agents and future capabilities

The current Resume Parsing, JD Parsing, and Matching Analysis one-shot operations
pass the normalized language directly into the current Agent. The Agent renders its
own prompt and never reads `Accept-Language`, a global locale, or browser state.
Future QuestionCard, follow-up, evaluation, review,
and recommendation Agents must inherit Session language rather than independently
reading UI language. `PracticeSession.language` and `InterviewSession.language` must
be immutable for the session lifetime and persisted so a full training round cannot
mix Chinese and English.

## Job Search Profile Management

### Resume Information Management

Resume information management maintains the user's core job search profile. Riva should use this information to personalize job matching analysis, question card generation, targeted practice, mock interviews, scoring, reviews, and training recommendations.

When a user first uses Riva, they need to provide their resume information. The input flow is:

```text
User uploads or pastes a resume
→ Riva identifies resume content
→ Riva generates structured information
→ User confirms, edits, or supplements the information
→ Riva saves it as the user's resume profile
```

When the extracted result is incomplete or inaccurate, the user can manually supplement or correct the information through a form.

Resume information management should maintain at least the following content:

1. Basic user information.
2. Education experience.
3. Work experience.
4. Project experience.
5. Skill tags.
6. Certificates or awards.
7. Target roles.
8. Job search direction.

### Target Role Management

Target role management records the roles the user is currently preparing for and provides context for JD parsing, matching analysis, question card generation, and training recommendations.

Target role information should include at least:

1. Role title.
2. Company name.
3. Role type.
4. Job description.
5. User preparation status for the role.

## Job Understanding and Matching

### JD Parsing

Riva should understand the target JD and identify the following information:

1. Role title.
2. Company name.
3. Role type.
4. Responsibilities.
5. Required skills.
6. Preferred skills.
7. Experience requirements.
8. Soft-skill requirements.
9. Business domain.
10. High-frequency keywords.

### Resume Matching Analysis

Riva should combine the user's resume and target JD to generate a matching analysis report. The report should include:

1. Summary of the role's core requirements.
2. User-to-role matching analysis, including strong matches, missing capabilities, and under-expressed capabilities.
3. Resume highlights, such as projects or experiences worth preparing in depth.
4. Resume gaps, such as unclear project descriptions or weak points that may be challenged in interviews.
5. Interview preparation suggestions.

The matching analysis result should be an important input for question card generation, targeted practice recommendations, and mock interview question set generation.

## Question Cards and Single-Question Practice

### Question Cards

A question card is the smallest interview training unit in Riva. It is a structured training object organized around a single interview question. Both targeted practice and mock interviews are based on question cards: targeted practice focuses on immediate single-question feedback, while mock interviews focus on continuous multi-question training and full-session review.

A question card should include at least:

1. Question.
2. `language: InteractionLanguage`, explicitly identifying the language of all
   human-readable RIVA-generated content in the card.
3. Question type.
4. Difficulty.
5. Assessed capabilities.
6. Recommended project or experience materials.
7. Answering hints.
8. Possible follow-up directions.
9. Scoring reference.

A question card must not make its language guessable only from its text. An
independent card uses the `interactionLanguage` captured when its Agent is invoked;
a card belonging to a `PracticeSession` or `InterviewSession` must equal
the owning Session's `language`.

When generating personalized question cards, Riva should refer to:

1. User resume information.
2. Project experience.
3. Skill tags.
4. Target JD.
5. Job matching analysis result.
6. Historical practice performance.
7. Current weak areas.

Question types include but are not limited to:

1. Project deep dive: Follow-up questions around projects in the resume, with further exploration of project weaknesses when relevant.
2. Behavioral interview: Assesses communication, collaboration, stress handling, conflict management, and related capabilities.
3. Business understanding: Assesses the core capabilities required by the JD and the user's understanding of the target role.
4. Motivation: Assesses the user's interest in the target role, career plan, and job search logic.
5. Technical fundamentals: For technical roles, focuses on technologies mentioned in the target JD and the user's project tech stack.

Question card difficulty levels include:

1. Basic: Direct questions that mainly assess whether the user can clearly explain experience, capabilities, and results.
2. High-pressure: More open-ended questions with stronger follow-up pressure and stress scenarios.

The user-facing question card should mainly display the question, question type, difficulty, assessed capabilities, optional answering hints, and optional recommended materials. It should not display full reference answers, full scoring criteria, or internal follow-up strategies by default.

### Single-Question Practice

Single-question practice allows the user to complete one full practice session around a question card. It should include the following steps:

1. Display the question.
2. Receive the user's answer.
3. Provide optional answering hints.
4. Ask dynamic follow-up questions based on the user's answer.
5. Record the user's follow-up answers.
6. Score the answer.
7. Generate a single-question review.
8. Identify or update weak areas.
9. Recommend the next question or suggest retrying the current question.

Riva should support multi-dimensional scoring for single-question answers. Scoring dimensions include:

1. Content relevance.
2. Structural clarity.
3. Specificity.
4. Expression of personal contribution.
5. Results and data support.
6. Role fit.
7. Communication quality.
8. Risk control.

The scoring result should help the user understand their current answer quality, rather than only showing a score.

A single-question review should include:

1. Performance summary for the question.
2. Answer strengths.
3. Main issues.
4. Improvement suggestions.
5. Reusable answer structure.
6. Whether the user should retry the current question.
7. Follow-up training suggestions.

Review suggestions should be specific, actionable, and related to the user's current answer.

## Targeted Practice and Mock Interviews

### Targeted Practice

Targeted practice focuses on concentrated training for a specific type of interview question. Its core positioning is: **single-question training, immediate feedback, rapid improvement, and coaching-oriented guidance**.

Before starting targeted practice, the user can choose:

1. Target role.
2. Question type.
3. Difficulty.
4. Whether to prioritize weak areas.
5. Whether to practice saved questions.
6. Whether to retry historical questions.

Targeted practice proceeds question by question. The basic flow is:

```text
User selects practice settings
→ Riva presents a question
→ User answers
→ Riva asks follow-up questions or ends the current question based on the answer
→ Riva shows the single-question score
→ Riva shows the single-question review
→ Riva recommends the next question or suggests retrying the current question
```

Targeted practice should support the following training actions:

1. Practice by question type.
2. Practice by target role.
3. Practice by difficulty.
4. Practice by weak area.
5. Practice saved questions.
6. Retry historical questions.
7. Skip the current question.
8. Request answering hints.
9. Request an answer framework.
10. Save a question.
11. Mark a question as weak.
12. Retry the current question.
13. Continue to the next question.
14. End the current practice session.

After each question, Riva should immediately show the single-question score, answer strengths, main issues, improvement suggestions, reusable answer structure, retry suggestion, and next-question recommendation.

Targeted practice recommendations should combine the current question type, difficulty, weak areas, historical performance, and single-question review to recommend the next question or suggest retrying the current question.

### Mock Interview

A mock interview simulates a real interview process. Its core positioning is: **continuous multi-question flow, complete interview process, full-session review, and realistic interviewer experience**.

Before starting a mock interview, the user needs to select:

1. Target role.
2. Interview round.
3. Difficulty.

Interview rounds include:

1. HR round.
2. First business round.
3. Technical round.
4. Manager round.
5. Final round.
6. Comprehensive mock interview.

Different rounds should have different question focuses.

A mock interview should generate a question set around the target role and interview round. One mock interview contains multiple questions, which may cover:

1. Self-introduction.
2. Project experience deep dive.
3. Role capability questions.
4. Behavioral interview questions.
5. Technical or business understanding.
6. Resume risk-point follow-ups.
7. Motivation.
8. Candidate question session.

The proportion of question types should vary across different interview rounds.

A mock interview proceeds as a continuous multi-question session. The basic flow is:

```text
User selects interview settings
→ Riva generates the interview question set
→ Riva gives opening instructions
→ Riva asks questions in sequence
→ User answers each question
→ Riva asks dynamic follow-up questions based on answers
→ Riva records performance for each question
→ Riva moves to the next question
→ Candidate question session
→ Interview ends
→ Riva generates the full-session review
→ Riva updates weak areas
→ Riva recommends the next round of training
```

During a mock interview, Riva should maintain the interviewer role and should not show detailed scoring or full reviews after each question, to avoid disrupting the continuous interview experience.

Mock interviews should support the following capabilities:

1. Simulate by target role.
2. Simulate by interview round.
3. Simulate by difficulty.
4. Generate a continuous question set.
5. Provide opening instructions.
6. Ask interview questions in sequence.
7. Ask dynamic follow-up questions based on user answers.
8. Record performance for each question.
9. Support the candidate question session.
10. Generate a full-session review report.
11. Update weak areas.
12. Recommend the next training direction.
13. Save the complete mock interview record.

Mock interviews should include a candidate question session. Riva can prompt the user to ask the interviewer questions, provide brief feedback on the quality of the user's questions, and suggest better alternatives.

Candidate questions may focus on:

1. Role responsibilities.
2. Team structure.
3. Business goals.
4. Growth path.
5. Working style.
6. Next steps in the interview process.

After a mock interview ends, Riva should generate a full-session review report. The review should include:

1. Overall performance summary.
2. Per-question performance overview.
3. Main strengths.
4. Frequent issues.
5. Exposed weak areas.
6. Interview risk points.
7. Communication improvement suggestions.
8. Pre-interview preparation suggestions.
9. Recommended next training type.

## Training Records and Recommendations

### Practice Record Management

Practice record management stores training data generated by the user in Riva. It supports future question card recommendations, weak-area tracking, review suggestions, and training direction recommendations.

Practice record management should maintain at least:

1. Historical targeted practice records.
2. Historical mock interview records.
3. User answer records.
4. Riva follow-up question records.
5. User follow-up answer records.
6. Scoring results.
7. Review suggestions.
8. Weak areas.
9. Saved questions.
10. Questions marked as weak.
11. Next-question recommendation records.
12. Next-round training recommendation records.

Practice records should only be used inside Riva for interview training, reviews, and recommendations.

### Single-Question Practice Records

Riva should save single-question practice records. Each record includes:

1. Question card information.
2. User answer.
3. Riva follow-up questions.
4. User follow-up answers.
5. Single-question score.
6. Single-question review.
7. Exposed weak areas.
8. Follow-up training recommendations.

### Targeted Practice Records

Each targeted practice session should save:

1. Practice time.
2. Target role.
3. Question type.
4. Difficulty.
5. Question card information.
6. User answer.
7. Riva follow-up questions.
8. User follow-up answers.
9. Single-question score.
10. Single-question review.
11. Improvement suggestions.
12. Next-question recommendation.
13. Whether the question was retried.
14. Whether the question was saved.
15. Whether the question was marked as weak.

### Mock Interview Records

Each mock interview should save:

1. Interview time.
2. Target role.
3. Interview round.
4. Interview difficulty.
5. Interview question set.
6. User answers for each question.
7. Riva follow-up questions.
8. User follow-up answers.
9. Per-question performance records.
10. Full-session review report.
11. Exposed weak areas.
12. Next-round training suggestions.

### Weak Areas and Training Recommendations

Riva should continuously identify and update weak areas based on the user's performance in single-question practice, targeted practice, and mock interviews. It should use these weak areas to recommend follow-up training directions.

Unified training recommendation results include:

1. Recommended next question.
2. Recommendation to retry the current question.
3. Recommendation to adjust difficulty.
4. Recommendation to switch question type.
5. Recommendation to continue the current question type.
6. Recommendation to enter a mock interview.
7. Recommended targeted practice direction.
8. Recommendation to take another mock interview.
9. Recommended question types to review.
10. Recommendation reason.

Training recommendations should help the user determine whether to continue strengthening individual capabilities or move into a complete interview simulation.
