--
-- PostgreSQL database dump
--

\restrict c88wbzqyiSZbCoveOaFIb4f0f6ulUb9nAraLWPMENsS6X1vpF3lxb2pxgWqMLG9

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.agent_runs (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    agent_id character varying(128) NOT NULL,
    prompt_id character varying(128) NOT NULL,
    prompt_version character varying(64) NOT NULL,
    output_schema_id character varying(128) NOT NULL,
    status character varying(9) NOT NULL,
    payload json NOT NULL,
    idempotency_key character varying(255) NOT NULL,
    attempt_count integer NOT NULL,
    max_attempts integer NOT NULL,
    available_at timestamp with time zone NOT NULL,
    lease_owner character varying(255),
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    provider character varying(128),
    model character varying(255) NOT NULL,
    input_tokens integer,
    output_tokens integer,
    result json,
    error_code character varying(64),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT agent_run_status CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT ck_agent_runs_attempts CHECK (((attempt_count >= 0) AND (max_attempts >= 1) AND (attempt_count <= max_attempts))),
    CONSTRAINT ck_agent_runs_started_at CHECK ((((attempt_count = 0) AND (started_at IS NULL)) OR ((attempt_count > 0) AND (started_at IS NOT NULL)))),
    CONSTRAINT ck_agent_runs_status_fields CHECK (((((status)::text = 'queued'::text) AND (attempt_count < max_attempts) AND (lease_owner IS NULL) AND (lease_token IS NULL) AND (lease_expires_at IS NULL) AND (finished_at IS NULL) AND (result IS NULL) AND (provider IS NULL) AND (input_tokens IS NULL) AND (output_tokens IS NULL)) OR (((status)::text = 'running'::text) AND (attempt_count >= 1) AND (lease_owner IS NOT NULL) AND (lease_token IS NOT NULL) AND (lease_expires_at IS NOT NULL) AND (finished_at IS NULL) AND (result IS NULL) AND (provider IS NULL) AND (input_tokens IS NULL) AND (output_tokens IS NULL)) OR (((status)::text = 'succeeded'::text) AND (attempt_count >= 1) AND (lease_owner IS NULL) AND (lease_token IS NULL) AND (lease_expires_at IS NULL) AND (finished_at IS NOT NULL) AND (result IS NOT NULL) AND (provider IS NOT NULL) AND (input_tokens IS NOT NULL) AND (output_tokens IS NOT NULL) AND (error_code IS NULL)) OR (((status)::text = 'failed'::text) AND (attempt_count >= 1) AND (lease_owner IS NULL) AND (lease_token IS NULL) AND (lease_expires_at IS NULL) AND (finished_at IS NOT NULL) AND (result IS NULL) AND (provider IS NULL) AND (input_tokens IS NULL) AND (output_tokens IS NULL) AND (error_code IS NOT NULL))))
);


ALTER TABLE public.agent_runs OWNER TO riva;

--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.auth_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_digest character varying(64) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);


ALTER TABLE public.auth_sessions OWNER TO riva;

--
-- Name: career_profile_educations; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.career_profile_educations (
    id uuid NOT NULL,
    career_profile_id uuid NOT NULL,
    "position" integer NOT NULL,
    school character varying(255) NOT NULL,
    degree character varying(255),
    major character varying(255),
    start_date character varying(7) NOT NULL,
    end_date character varying(7),
    is_current boolean NOT NULL,
    source character varying(32) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT career_profile_educations_position_check CHECK (("position" >= 0))
);


ALTER TABLE public.career_profile_educations OWNER TO riva;

--
-- Name: career_profile_project_experiences; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.career_profile_project_experiences (
    id uuid NOT NULL,
    career_profile_id uuid NOT NULL,
    "position" integer NOT NULL,
    name character varying(255) NOT NULL,
    role character varying(255),
    start_date character varying(7) NOT NULL,
    end_date character varying(7),
    responsibilities json NOT NULL,
    achievements json NOT NULL,
    project_url character varying(2083),
    source character varying(32) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT career_profile_project_experiences_position_check CHECK (("position" >= 0))
);


ALTER TABLE public.career_profile_project_experiences OWNER TO riva;

--
-- Name: career_profile_project_skills; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.career_profile_project_skills (
    id uuid NOT NULL,
    career_profile_id uuid NOT NULL,
    project_experience_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT career_profile_project_skills_position_check CHECK (("position" >= 0))
);


ALTER TABLE public.career_profile_project_skills OWNER TO riva;

--
-- Name: career_profile_skills; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.career_profile_skills (
    id uuid NOT NULL,
    career_profile_id uuid NOT NULL,
    "position" integer NOT NULL,
    name character varying(255) NOT NULL,
    normalized_name character varying(255) NOT NULL,
    source character varying(32) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT career_profile_skills_position_check CHECK (("position" >= 0))
);


ALTER TABLE public.career_profile_skills OWNER TO riva;

--
-- Name: career_profile_work_experiences; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.career_profile_work_experiences (
    id uuid NOT NULL,
    career_profile_id uuid NOT NULL,
    "position" integer NOT NULL,
    company character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    employment_type character varying(32) NOT NULL,
    location character varying(255),
    start_date character varying(7) NOT NULL,
    end_date character varying(7),
    is_current boolean NOT NULL,
    responsibilities json NOT NULL,
    achievements json NOT NULL,
    source character varying(32) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT career_profile_work_experiences_position_check CHECK (("position" >= 0))
);


ALTER TABLE public.career_profile_work_experiences OWNER TO riva;

--
-- Name: career_profile_work_skills; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.career_profile_work_skills (
    id uuid NOT NULL,
    career_profile_id uuid NOT NULL,
    work_experience_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT career_profile_work_skills_position_check CHECK (("position" >= 0))
);


ALTER TABLE public.career_profile_work_skills OWNER TO riva;

--
-- Name: career_profiles; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.career_profiles (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    summary text,
    version integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT career_profiles_version_check CHECK ((version >= 1))
);


ALTER TABLE public.career_profiles OWNER TO riva;

--
-- Name: current_target_roles; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.current_target_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.current_target_roles OWNER TO riva;

--
-- Name: job_description_analyses; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.job_description_analyses (
    role_id uuid NOT NULL,
    user_id uuid NOT NULL,
    job_description_version integer NOT NULL,
    analysis_version integer NOT NULL,
    source_agent_run_id uuid NOT NULL,
    parsed_at timestamp with time zone NOT NULL,
    riva_summary text NOT NULL,
    responsibilities json NOT NULL,
    qualification_requirements json NOT NULL,
    required_skills json NOT NULL,
    preferred_qualifications json NOT NULL,
    soft_skills json NOT NULL,
    business_domains json NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_job_description_analyses_analysis_version CHECK ((analysis_version >= 1)),
    CONSTRAINT ck_job_description_analyses_jd_version CHECK ((job_description_version >= 1)),
    CONSTRAINT ck_job_description_analyses_summary_not_blank CHECK ((length(TRIM(BOTH FROM riva_summary)) > 0))
);


ALTER TABLE public.job_description_analyses OWNER TO riva;

--
-- Name: matching_analyses; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.matching_analyses (
    role_id uuid NOT NULL,
    user_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    profile_version integer NOT NULL,
    job_description_version integer NOT NULL,
    job_description_analysis_version integer NOT NULL,
    source_agent_run_id uuid NOT NULL,
    generated_at timestamp with time zone NOT NULL,
    overall_match_score integer NOT NULL,
    core_requirements_summary text NOT NULL,
    matched_capabilities json NOT NULL,
    missing_capabilities json NOT NULL,
    underrepresented_capabilities json NOT NULL,
    resume_highlights json NOT NULL,
    resume_gaps json NOT NULL,
    high_risk_questions json NOT NULL,
    preparation_recommendations json NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_matching_analyses_analysis_version CHECK ((job_description_analysis_version >= 1)),
    CONSTRAINT ck_matching_analyses_jd_version CHECK ((job_description_version >= 1)),
    CONSTRAINT ck_matching_analyses_profile_version CHECK ((profile_version >= 1)),
    CONSTRAINT ck_matching_analyses_score CHECK (((overall_match_score >= 0) AND (overall_match_score <= 100))),
    CONSTRAINT ck_matching_analyses_summary_not_blank CHECK ((length(TRIM(BOTH FROM core_requirements_summary)) > 0))
);


ALTER TABLE public.matching_analyses OWNER TO riva;

--
-- Name: practice_answers; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.practice_answers (
    id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    kind character varying(16) NOT NULL,
    "order" integer NOT NULL,
    content text NOT NULL,
    follow_up_question_id uuid,
    submitted_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_practice_answers_content CHECK (((length(TRIM(BOTH FROM content)) > 0) AND (length(content) <= 20000))),
    CONSTRAINT ck_practice_answers_kind_order_question CHECK (((((kind)::text = 'main'::text) AND ("order" = 1) AND (follow_up_question_id IS NULL)) OR (((kind)::text = 'followUp'::text) AND ("order" >= 2) AND (follow_up_question_id IS NOT NULL)))),
    CONSTRAINT ck_practice_answers_order CHECK (("order" >= 1))
);


ALTER TABLE public.practice_answers OWNER TO riva;

--
-- Name: practice_attempts; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.practice_attempts (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    question_type character varying(64) NOT NULL,
    difficulty character varying(32) NOT NULL,
    status character varying(32) NOT NULL,
    question_generation_run_id uuid,
    question_card_id uuid,
    retry_of_attempt_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT ck_practice_attempts_attempt_number CHECK ((attempt_number >= 1)),
    CONSTRAINT ck_practice_attempts_difficulty CHECK (((difficulty)::text = ANY ((ARRAY['basic'::character varying, 'pressure'::character varying])::text[]))),
    CONSTRAINT ck_practice_attempts_question_type CHECK (((question_type)::text = ANY ((ARRAY['projectDeepDive'::character varying, 'behavioral'::character varying, 'businessUnderstanding'::character varying, 'motivation'::character varying, 'technicalFoundation'::character varying])::text[]))),
    CONSTRAINT ck_practice_attempts_status CHECK (((status)::text = ANY ((ARRAY['generatingQuestion'::character varying, 'answering'::character varying, 'answeringFollowUp'::character varying, 'evaluating'::character varying, 'review'::character varying, 'completed'::character varying, 'endedEarly'::character varying])::text[])))
);


ALTER TABLE public.practice_attempts OWNER TO riva;

--
-- Name: practice_evaluations; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.practice_evaluations (
    id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    source_agent_run_id uuid NOT NULL,
    overall_score integer NOT NULL,
    dimension_scores json NOT NULL,
    focus_assessments json NOT NULL,
    evaluated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_practice_evaluations_overall_score CHECK (((overall_score >= 0) AND (overall_score <= 100)))
);


ALTER TABLE public.practice_evaluations OWNER TO riva;

--
-- Name: practice_follow_up_decisions; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.practice_follow_up_decisions (
    id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    source_agent_run_id uuid NOT NULL,
    "order" integer NOT NULL,
    action character varying(16) NOT NULL,
    follow_up_question_id uuid,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_practice_follow_up_decisions_action CHECK (((action)::text = ANY ((ARRAY['askFollowUp'::character varying, 'complete'::character varying])::text[]))),
    CONSTRAINT ck_practice_follow_up_decisions_action_question CHECK (((((action)::text = 'askFollowUp'::text) AND (follow_up_question_id IS NOT NULL)) OR (((action)::text = 'complete'::text) AND (follow_up_question_id IS NULL)))),
    CONSTRAINT ck_practice_follow_up_decisions_order CHECK ((("order" >= 1) AND ("order" <= 2)))
);


ALTER TABLE public.practice_follow_up_decisions OWNER TO riva;

--
-- Name: practice_follow_up_questions; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.practice_follow_up_questions (
    id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    source_agent_run_id uuid NOT NULL,
    "order" integer NOT NULL,
    prompt text NOT NULL,
    focus text NOT NULL,
    answer_hints json NOT NULL,
    answer_framework json NOT NULL,
    answer_hints_revealed boolean NOT NULL,
    answer_framework_revealed boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_practice_follow_up_questions_focus CHECK (((length(TRIM(BOTH FROM focus)) > 0) AND (length(focus) <= 1000))),
    CONSTRAINT ck_practice_follow_up_questions_order CHECK (("order" >= 1)),
    CONSTRAINT ck_practice_follow_up_questions_prompt CHECK (((length(TRIM(BOTH FROM prompt)) > 0) AND (length(prompt) <= 4000)))
);


ALTER TABLE public.practice_follow_up_questions OWNER TO riva;

--
-- Name: practice_recommendations; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.practice_recommendations (
    id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    source_agent_run_id uuid NOT NULL,
    action character varying(16) NOT NULL,
    reason text NOT NULL,
    next_question_type character varying(64),
    next_difficulty character varying(32),
    focus_areas json NOT NULL,
    recommended_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_practice_recommendations_action CHECK (((action)::text = ANY ((ARRAY['retryCurrent'::character varying, 'nextQuestion'::character varying])::text[]))),
    CONSTRAINT ck_practice_recommendations_action_plan CHECK (((((action)::text = 'retryCurrent'::text) AND (next_question_type IS NULL) AND (next_difficulty IS NULL)) OR (((action)::text = 'nextQuestion'::text) AND (next_question_type IS NOT NULL) AND (next_difficulty IS NOT NULL)))),
    CONSTRAINT ck_practice_recommendations_difficulty CHECK (((next_difficulty IS NULL) OR ((next_difficulty)::text = ANY ((ARRAY['basic'::character varying, 'pressure'::character varying])::text[])))),
    CONSTRAINT ck_practice_recommendations_question_type CHECK (((next_question_type IS NULL) OR ((next_question_type)::text = ANY ((ARRAY['projectDeepDive'::character varying, 'behavioral'::character varying, 'businessUnderstanding'::character varying, 'motivation'::character varying, 'technicalFoundation'::character varying])::text[])))),
    CONSTRAINT ck_practice_recommendations_reason CHECK (((length(TRIM(BOTH FROM reason)) > 0) AND (length(reason) <= 2000)))
);


ALTER TABLE public.practice_recommendations OWNER TO riva;

--
-- Name: practice_reviews; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.practice_reviews (
    id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    source_agent_run_id uuid NOT NULL,
    overall_performance text NOT NULL,
    highlights json NOT NULL,
    main_issues json NOT NULL,
    improvement_suggestions json NOT NULL,
    reusable_answer_structure json NOT NULL,
    exposed_weaknesses json NOT NULL,
    reviewed_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_practice_reviews_overall_performance CHECK (((length(TRIM(BOTH FROM overall_performance)) > 0) AND (length(overall_performance) <= 4000)))
);


ALTER TABLE public.practice_reviews OWNER TO riva;

--
-- Name: practice_sessions; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.practice_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    target_role_id uuid NOT NULL,
    language character varying(16) NOT NULL,
    version integer NOT NULL,
    status character varying(32) NOT NULL,
    initial_question_type character varying(64) NOT NULL,
    initial_difficulty character varying(32) NOT NULL,
    source character varying(32) NOT NULL,
    prioritize_weaknesses boolean NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    completion_reason character varying(32),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_practice_sessions_completion_reason CHECK (((completion_reason IS NULL) OR ((completion_reason)::text = ANY ((ARRAY['reviewCompleted'::character varying, 'userEndedEarly'::character varying])::text[])))),
    CONSTRAINT ck_practice_sessions_completion_state CHECK (((((status)::text = 'active'::text) AND (completed_at IS NULL) AND (completion_reason IS NULL)) OR (((status)::text = 'completed'::text) AND (completed_at IS NOT NULL) AND (completion_reason IS NOT NULL)))),
    CONSTRAINT ck_practice_sessions_initial_difficulty CHECK (((initial_difficulty)::text = ANY ((ARRAY['basic'::character varying, 'pressure'::character varying])::text[]))),
    CONSTRAINT ck_practice_sessions_initial_question_type CHECK (((initial_question_type)::text = ANY ((ARRAY['projectDeepDive'::character varying, 'behavioral'::character varying, 'businessUnderstanding'::character varying, 'motivation'::character varying, 'technicalFoundation'::character varying])::text[]))),
    CONSTRAINT ck_practice_sessions_language CHECK (((language)::text = ANY ((ARRAY['zh-CN'::character varying, 'en'::character varying])::text[]))),
    CONSTRAINT ck_practice_sessions_source CHECK (((source)::text = ANY ((ARRAY['personalized'::character varying, 'saved'::character varying, 'history'::character varying])::text[]))),
    CONSTRAINT ck_practice_sessions_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying])::text[]))),
    CONSTRAINT ck_practice_sessions_version CHECK ((version >= 1))
);


ALTER TABLE public.practice_sessions OWNER TO riva;

--
-- Name: question_cards; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.question_cards (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    target_role_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    source_agent_run_id uuid NOT NULL,
    matching_analysis_run_id uuid NOT NULL,
    language character varying(16) NOT NULL,
    question_type character varying(64) NOT NULL,
    difficulty character varying(32) NOT NULL,
    prompt text NOT NULL,
    assessed_capabilities json NOT NULL,
    recommended_materials json NOT NULL,
    answer_hints json NOT NULL,
    answer_framework json NOT NULL,
    follow_up_directions json NOT NULL,
    scoring_focus json NOT NULL,
    profile_version integer NOT NULL,
    job_description_version integer NOT NULL,
    job_description_analysis_version integer NOT NULL,
    is_saved boolean NOT NULL,
    is_marked_weak boolean NOT NULL,
    answer_hints_revealed boolean NOT NULL,
    answer_framework_revealed boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_question_cards_analysis_version CHECK ((job_description_analysis_version >= 1)),
    CONSTRAINT ck_question_cards_difficulty CHECK (((difficulty)::text = ANY ((ARRAY['basic'::character varying, 'pressure'::character varying])::text[]))),
    CONSTRAINT ck_question_cards_jd_version CHECK ((job_description_version >= 1)),
    CONSTRAINT ck_question_cards_language CHECK (((language)::text = ANY ((ARRAY['zh-CN'::character varying, 'en'::character varying])::text[]))),
    CONSTRAINT ck_question_cards_profile_version CHECK ((profile_version >= 1)),
    CONSTRAINT ck_question_cards_prompt_not_blank CHECK ((length(TRIM(BOTH FROM prompt)) > 0)),
    CONSTRAINT ck_question_cards_question_type CHECK (((question_type)::text = ANY ((ARRAY['projectDeepDive'::character varying, 'behavioral'::character varying, 'businessUnderstanding'::character varying, 'motivation'::character varying, 'technicalFoundation'::character varying])::text[])))
);


ALTER TABLE public.question_cards OWNER TO riva;

--
-- Name: resume_documents; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.resume_documents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    source_type character varying(32) NOT NULL,
    original_filename character varying(255),
    media_type character varying(127) NOT NULL,
    byte_size bigint NOT NULL,
    sha256 character varying(64) NOT NULL,
    storage_key character varying(512),
    extraction_status character varying(32) NOT NULL,
    extracted_text text,
    extraction_failure_code character varying(64),
    uploaded_at timestamp with time zone NOT NULL,
    extracted_at timestamp with time zone,
    parsing_run_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_resume_documents_byte_size_positive CHECK ((byte_size > 0)),
    CONSTRAINT ck_resume_documents_extraction_fields CHECK (((((extraction_status)::text = 'pending'::text) AND (extracted_text IS NULL) AND (extraction_failure_code IS NULL) AND (extracted_at IS NULL)) OR (((extraction_status)::text = 'succeeded'::text) AND (extracted_text IS NOT NULL) AND (length(TRIM(BOTH FROM extracted_text)) > 0) AND (extraction_failure_code IS NULL) AND (extracted_at IS NOT NULL)) OR (((extraction_status)::text = 'failed'::text) AND (extracted_text IS NULL) AND (extraction_failure_code IS NOT NULL) AND (length(TRIM(BOTH FROM extraction_failure_code)) > 0) AND (extracted_at IS NOT NULL)))),
    CONSTRAINT ck_resume_documents_extraction_status CHECK (((extraction_status)::text = ANY ((ARRAY['pending'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT ck_resume_documents_sha256_length CHECK ((length((sha256)::text) = 64)),
    CONSTRAINT ck_resume_documents_source_fields CHECK (((((source_type)::text = 'file'::text) AND (original_filename IS NOT NULL) AND (length(TRIM(BOTH FROM original_filename)) > 0) AND (storage_key IS NOT NULL) AND (length(TRIM(BOTH FROM storage_key)) > 0)) OR (((source_type)::text = 'pastedText'::text) AND (original_filename IS NULL) AND (storage_key IS NULL) AND ((media_type)::text = 'text/plain'::text)))),
    CONSTRAINT ck_resume_documents_source_type CHECK (((source_type)::text = ANY ((ARRAY['file'::character varying, 'pastedText'::character varying])::text[])))
);


ALTER TABLE public.resume_documents OWNER TO riva;

--
-- Name: resume_import_drafts; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.resume_import_drafts (
    resume_document_id uuid NOT NULL,
    user_id uuid NOT NULL,
    parsing_result_version integer NOT NULL,
    source_agent_run_id uuid NOT NULL,
    base_profile_id uuid,
    base_profile_version integer,
    draft_version integer NOT NULL,
    status character varying(32) NOT NULL,
    summary text,
    summary_action character varying(32) NOT NULL,
    education json NOT NULL,
    work_experiences json NOT NULL,
    project_experiences json NOT NULL,
    skills json NOT NULL,
    unresolved_items json NOT NULL,
    skipped_items json NOT NULL,
    protected_items json NOT NULL,
    change_summary json NOT NULL,
    applied_profile_version integer,
    applied_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_resume_import_drafts_applied_state CHECK (((((status)::text = ANY ((ARRAY['ready'::character varying, 'superseded'::character varying])::text[])) AND (applied_profile_version IS NULL) AND (applied_at IS NULL)) OR (((status)::text = 'applied'::text) AND (applied_profile_version IS NOT NULL) AND (applied_profile_version >= 1) AND (applied_at IS NOT NULL)))),
    CONSTRAINT ck_resume_import_drafts_base_profile_consistency CHECK ((((base_profile_id IS NULL) AND (base_profile_version IS NULL)) OR ((base_profile_id IS NOT NULL) AND (base_profile_version IS NOT NULL) AND (base_profile_version >= 1)))),
    CONSTRAINT ck_resume_import_drafts_draft_version CHECK ((draft_version >= 1)),
    CONSTRAINT ck_resume_import_drafts_parsing_result_version CHECK ((parsing_result_version >= 1)),
    CONSTRAINT ck_resume_import_drafts_status CHECK (((status)::text = ANY ((ARRAY['ready'::character varying, 'applied'::character varying, 'superseded'::character varying])::text[]))),
    CONSTRAINT ck_resume_import_drafts_summary_action CHECK (((summary_action)::text = ANY ((ARRAY['set'::character varying, 'preserve'::character varying, 'none'::character varying])::text[])))
);


ALTER TABLE public.resume_import_drafts OWNER TO riva;

--
-- Name: resume_parsing_results; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.resume_parsing_results (
    resume_document_id uuid NOT NULL,
    user_id uuid NOT NULL,
    result_version integer NOT NULL,
    source_agent_run_id uuid NOT NULL,
    parsed_at timestamp with time zone NOT NULL,
    summary text,
    education json NOT NULL,
    work_experiences json NOT NULL,
    project_experiences json NOT NULL,
    skills json NOT NULL,
    unresolved_items json NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_resume_parsing_results_result_version CHECK ((result_version >= 1))
);


ALTER TABLE public.resume_parsing_results OWNER TO riva;

--
-- Name: target_roles; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.target_roles (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    company character varying(255),
    recruitment_type character varying(32),
    location character varying(255),
    min_experience_years integer,
    max_experience_years integer,
    preparation_status character varying(32) NOT NULL,
    job_description_status character varying(32) NOT NULL,
    raw_job_description text,
    job_description_version integer,
    job_description_parsing_run_id uuid,
    matching_analysis_run_id uuid,
    version integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT target_roles_check CHECK (((min_experience_years IS NULL) OR (max_experience_years IS NULL) OR (max_experience_years >= min_experience_years))),
    CONSTRAINT target_roles_check1 CHECK (((((job_description_status)::text = 'missing'::text) AND (raw_job_description IS NULL) AND (job_description_version IS NULL)) OR (((job_description_status)::text = 'saved'::text) AND (raw_job_description IS NOT NULL) AND (length(TRIM(BOTH FROM raw_job_description)) > 0) AND (job_description_version >= 1)))),
    CONSTRAINT target_roles_job_description_status_check CHECK (((job_description_status)::text = ANY ((ARRAY['missing'::character varying, 'saved'::character varying])::text[]))),
    CONSTRAINT target_roles_job_description_version_check CHECK (((job_description_version IS NULL) OR (job_description_version >= 1))),
    CONSTRAINT target_roles_max_experience_years_check CHECK (((max_experience_years IS NULL) OR (max_experience_years >= 0))),
    CONSTRAINT target_roles_min_experience_years_check CHECK (((min_experience_years IS NULL) OR (min_experience_years >= 0))),
    CONSTRAINT target_roles_preparation_status_check CHECK (((preparation_status)::text = ANY ((ARRAY['preparing'::character varying, 'paused'::character varying, 'archived'::character varying])::text[]))),
    CONSTRAINT target_roles_recruitment_type_check CHECK (((recruitment_type)::text = ANY ((ARRAY['campus'::character varying, 'experienced'::character varying])::text[]))),
    CONSTRAINT target_roles_version_check CHECK ((version >= 1))
);


ALTER TABLE public.target_roles OWNER TO riva;

--
-- Name: users; Type: TABLE; Schema: public; Owner: riva
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    username character varying(32) NOT NULL,
    normalized_username character varying(32) NOT NULL,
    password_hash character varying(255) NOT NULL,
    display_name character varying(64) NOT NULL,
    avatar_url character varying(2083),
    is_active boolean NOT NULL,
    password_changed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.users OWNER TO riva;

--
-- Data for Name: agent_runs; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.agent_runs (id, user_id, agent_id, prompt_id, prompt_version, output_schema_id, status, payload, idempotency_key, attempt_count, max_attempts, available_at, lease_owner, lease_token, lease_expires_at, started_at, finished_at, provider, model, input_tokens, output_tokens, result, error_code, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: auth_sessions; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.auth_sessions (id, user_id, token_digest, created_at, last_seen_at, expires_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: career_profile_educations; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.career_profile_educations (id, career_profile_id, "position", school, degree, major, start_date, end_date, is_current, source, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: career_profile_project_experiences; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.career_profile_project_experiences (id, career_profile_id, "position", name, role, start_date, end_date, responsibilities, achievements, project_url, source, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: career_profile_project_skills; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.career_profile_project_skills (id, career_profile_id, project_experience_id, skill_id, "position", created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: career_profile_skills; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.career_profile_skills (id, career_profile_id, "position", name, normalized_name, source, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: career_profile_work_experiences; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.career_profile_work_experiences (id, career_profile_id, "position", company, title, employment_type, location, start_date, end_date, is_current, responsibilities, achievements, source, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: career_profile_work_skills; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.career_profile_work_skills (id, career_profile_id, work_experience_id, skill_id, "position", created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: career_profiles; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.career_profiles (id, user_id, summary, version, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: current_target_roles; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.current_target_roles (user_id, role_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: job_description_analyses; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.job_description_analyses (role_id, user_id, job_description_version, analysis_version, source_agent_run_id, parsed_at, riva_summary, responsibilities, qualification_requirements, required_skills, preferred_qualifications, soft_skills, business_domains, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: matching_analyses; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.matching_analyses (role_id, user_id, profile_id, profile_version, job_description_version, job_description_analysis_version, source_agent_run_id, generated_at, overall_match_score, core_requirements_summary, matched_capabilities, missing_capabilities, underrepresented_capabilities, resume_highlights, resume_gaps, high_risk_questions, preparation_recommendations, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: practice_answers; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.practice_answers (id, attempt_id, kind, "order", content, follow_up_question_id, submitted_at) FROM stdin;
\.


--
-- Data for Name: practice_attempts; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.practice_attempts (id, user_id, session_id, attempt_number, question_type, difficulty, status, question_generation_run_id, question_card_id, retry_of_attempt_id, created_at, updated_at, completed_at) FROM stdin;
\.


--
-- Data for Name: practice_evaluations; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.practice_evaluations (id, attempt_id, source_agent_run_id, overall_score, dimension_scores, focus_assessments, evaluated_at) FROM stdin;
\.


--
-- Data for Name: practice_follow_up_decisions; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.practice_follow_up_decisions (id, attempt_id, source_agent_run_id, "order", action, follow_up_question_id, created_at) FROM stdin;
\.


--
-- Data for Name: practice_follow_up_questions; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.practice_follow_up_questions (id, attempt_id, source_agent_run_id, "order", prompt, focus, answer_hints, answer_framework, answer_hints_revealed, answer_framework_revealed, created_at) FROM stdin;
\.


--
-- Data for Name: practice_recommendations; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.practice_recommendations (id, attempt_id, source_agent_run_id, action, reason, next_question_type, next_difficulty, focus_areas, recommended_at) FROM stdin;
\.


--
-- Data for Name: practice_reviews; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.practice_reviews (id, attempt_id, source_agent_run_id, overall_performance, highlights, main_issues, improvement_suggestions, reusable_answer_structure, exposed_weaknesses, reviewed_at) FROM stdin;
\.


--
-- Data for Name: practice_sessions; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.practice_sessions (id, user_id, target_role_id, language, version, status, initial_question_type, initial_difficulty, source, prioritize_weaknesses, started_at, completed_at, completion_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: question_cards; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.question_cards (id, user_id, target_role_id, profile_id, source_agent_run_id, matching_analysis_run_id, language, question_type, difficulty, prompt, assessed_capabilities, recommended_materials, answer_hints, answer_framework, follow_up_directions, scoring_focus, profile_version, job_description_version, job_description_analysis_version, is_saved, is_marked_weak, answer_hints_revealed, answer_framework_revealed, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: resume_documents; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.resume_documents (id, user_id, source_type, original_filename, media_type, byte_size, sha256, storage_key, extraction_status, extracted_text, extraction_failure_code, uploaded_at, extracted_at, parsing_run_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: resume_import_drafts; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.resume_import_drafts (resume_document_id, user_id, parsing_result_version, source_agent_run_id, base_profile_id, base_profile_version, draft_version, status, summary, summary_action, education, work_experiences, project_experiences, skills, unresolved_items, skipped_items, protected_items, change_summary, applied_profile_version, applied_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: resume_parsing_results; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.resume_parsing_results (resume_document_id, user_id, result_version, source_agent_run_id, parsed_at, summary, education, work_experiences, project_experiences, skills, unresolved_items, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: target_roles; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.target_roles (id, user_id, title, company, recruitment_type, location, min_experience_years, max_experience_years, preparation_status, job_description_status, raw_job_description, job_description_version, job_description_parsing_run_id, matching_analysis_run_id, version, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: riva
--

COPY public.users (id, username, normalized_username, password_hash, display_name, avatar_url, is_active, password_changed_at, created_at, updated_at) FROM stdin;
\.


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: career_profile_educations career_profile_educations_career_profile_id_position_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_educations
    ADD CONSTRAINT career_profile_educations_career_profile_id_position_key UNIQUE (career_profile_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: career_profile_educations career_profile_educations_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_educations
    ADD CONSTRAINT career_profile_educations_pkey PRIMARY KEY (id);


--
-- Name: career_profile_project_experiences career_profile_project_experienc_career_profile_id_position_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_experiences
    ADD CONSTRAINT career_profile_project_experienc_career_profile_id_position_key UNIQUE (career_profile_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: career_profile_project_experiences career_profile_project_experiences_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_experiences
    ADD CONSTRAINT career_profile_project_experiences_pkey PRIMARY KEY (id);


--
-- Name: career_profile_project_skills career_profile_project_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_skills
    ADD CONSTRAINT career_profile_project_skills_pkey PRIMARY KEY (id);


--
-- Name: career_profile_project_skills career_profile_project_skills_project_experience_id_positio_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_skills
    ADD CONSTRAINT career_profile_project_skills_project_experience_id_positio_key UNIQUE (project_experience_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: career_profile_project_skills career_profile_project_skills_project_experience_id_skill_i_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_skills
    ADD CONSTRAINT career_profile_project_skills_project_experience_id_skill_i_key UNIQUE (project_experience_id, skill_id);


--
-- Name: career_profile_skills career_profile_skills_career_profile_id_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_skills
    ADD CONSTRAINT career_profile_skills_career_profile_id_normalized_name_key UNIQUE (career_profile_id, normalized_name) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: career_profile_skills career_profile_skills_career_profile_id_position_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_skills
    ADD CONSTRAINT career_profile_skills_career_profile_id_position_key UNIQUE (career_profile_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: career_profile_skills career_profile_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_skills
    ADD CONSTRAINT career_profile_skills_pkey PRIMARY KEY (id);


--
-- Name: career_profile_work_experiences career_profile_work_experiences_career_profile_id_position_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_experiences
    ADD CONSTRAINT career_profile_work_experiences_career_profile_id_position_key UNIQUE (career_profile_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: career_profile_work_experiences career_profile_work_experiences_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_experiences
    ADD CONSTRAINT career_profile_work_experiences_pkey PRIMARY KEY (id);


--
-- Name: career_profile_work_skills career_profile_work_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_skills
    ADD CONSTRAINT career_profile_work_skills_pkey PRIMARY KEY (id);


--
-- Name: career_profile_work_skills career_profile_work_skills_work_experience_id_position_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_skills
    ADD CONSTRAINT career_profile_work_skills_work_experience_id_position_key UNIQUE (work_experience_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: career_profile_work_skills career_profile_work_skills_work_experience_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_skills
    ADD CONSTRAINT career_profile_work_skills_work_experience_id_skill_id_key UNIQUE (work_experience_id, skill_id);


--
-- Name: career_profiles career_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profiles
    ADD CONSTRAINT career_profiles_pkey PRIMARY KEY (id);


--
-- Name: current_target_roles current_target_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.current_target_roles
    ADD CONSTRAINT current_target_roles_pkey PRIMARY KEY (user_id);


--
-- Name: job_description_analyses job_description_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.job_description_analyses
    ADD CONSTRAINT job_description_analyses_pkey PRIMARY KEY (role_id);


--
-- Name: matching_analyses matching_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.matching_analyses
    ADD CONSTRAINT matching_analyses_pkey PRIMARY KEY (role_id);


--
-- Name: practice_answers practice_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_answers
    ADD CONSTRAINT practice_answers_pkey PRIMARY KEY (id);


--
-- Name: practice_attempts practice_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_attempts
    ADD CONSTRAINT practice_attempts_pkey PRIMARY KEY (id);


--
-- Name: practice_evaluations practice_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_evaluations
    ADD CONSTRAINT practice_evaluations_pkey PRIMARY KEY (id);


--
-- Name: practice_follow_up_decisions practice_follow_up_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_decisions
    ADD CONSTRAINT practice_follow_up_decisions_pkey PRIMARY KEY (id);


--
-- Name: practice_follow_up_questions practice_follow_up_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_questions
    ADD CONSTRAINT practice_follow_up_questions_pkey PRIMARY KEY (id);


--
-- Name: practice_recommendations practice_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_recommendations
    ADD CONSTRAINT practice_recommendations_pkey PRIMARY KEY (id);


--
-- Name: practice_reviews practice_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_reviews
    ADD CONSTRAINT practice_reviews_pkey PRIMARY KEY (id);


--
-- Name: practice_sessions practice_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_sessions
    ADD CONSTRAINT practice_sessions_pkey PRIMARY KEY (id);


--
-- Name: question_cards question_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.question_cards
    ADD CONSTRAINT question_cards_pkey PRIMARY KEY (id);


--
-- Name: resume_documents resume_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_documents
    ADD CONSTRAINT resume_documents_pkey PRIMARY KEY (id);


--
-- Name: resume_import_drafts resume_import_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_import_drafts
    ADD CONSTRAINT resume_import_drafts_pkey PRIMARY KEY (resume_document_id);


--
-- Name: resume_parsing_results resume_parsing_results_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_parsing_results
    ADD CONSTRAINT resume_parsing_results_pkey PRIMARY KEY (resume_document_id);


--
-- Name: target_roles target_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.target_roles
    ADD CONSTRAINT target_roles_pkey PRIMARY KEY (id);


--
-- Name: target_roles target_roles_user_id_id_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.target_roles
    ADD CONSTRAINT target_roles_user_id_id_key UNIQUE (user_id, id);


--
-- Name: agent_runs uq_agent_runs_idempotency; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT uq_agent_runs_idempotency UNIQUE (user_id, agent_id, prompt_id, prompt_version, idempotency_key);


--
-- Name: career_profiles uq_career_profiles_user_id_id; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profiles
    ADD CONSTRAINT uq_career_profiles_user_id_id UNIQUE (user_id, id);


--
-- Name: job_description_analyses uq_job_description_analyses_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.job_description_analyses
    ADD CONSTRAINT uq_job_description_analyses_source_run UNIQUE (source_agent_run_id);


--
-- Name: matching_analyses uq_matching_analyses_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.matching_analyses
    ADD CONSTRAINT uq_matching_analyses_source_run UNIQUE (source_agent_run_id);


--
-- Name: practice_answers uq_practice_answers_attempt_order; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_answers
    ADD CONSTRAINT uq_practice_answers_attempt_order UNIQUE (attempt_id, "order");


--
-- Name: practice_answers uq_practice_answers_follow_up_question; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_answers
    ADD CONSTRAINT uq_practice_answers_follow_up_question UNIQUE (follow_up_question_id);


--
-- Name: practice_attempts uq_practice_attempts_question_generation_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_attempts
    ADD CONSTRAINT uq_practice_attempts_question_generation_run UNIQUE (question_generation_run_id);


--
-- Name: practice_attempts uq_practice_attempts_session_attempt_number; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_attempts
    ADD CONSTRAINT uq_practice_attempts_session_attempt_number UNIQUE (session_id, attempt_number);


--
-- Name: practice_evaluations uq_practice_evaluations_attempt; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_evaluations
    ADD CONSTRAINT uq_practice_evaluations_attempt UNIQUE (attempt_id);


--
-- Name: practice_evaluations uq_practice_evaluations_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_evaluations
    ADD CONSTRAINT uq_practice_evaluations_source_run UNIQUE (source_agent_run_id);


--
-- Name: practice_follow_up_decisions uq_practice_follow_up_decisions_attempt_order; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_decisions
    ADD CONSTRAINT uq_practice_follow_up_decisions_attempt_order UNIQUE (attempt_id, "order");


--
-- Name: practice_follow_up_decisions uq_practice_follow_up_decisions_question; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_decisions
    ADD CONSTRAINT uq_practice_follow_up_decisions_question UNIQUE (follow_up_question_id);


--
-- Name: practice_follow_up_decisions uq_practice_follow_up_decisions_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_decisions
    ADD CONSTRAINT uq_practice_follow_up_decisions_source_run UNIQUE (source_agent_run_id);


--
-- Name: practice_follow_up_questions uq_practice_follow_up_questions_attempt_order; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_questions
    ADD CONSTRAINT uq_practice_follow_up_questions_attempt_order UNIQUE (attempt_id, "order");


--
-- Name: practice_follow_up_questions uq_practice_follow_up_questions_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_questions
    ADD CONSTRAINT uq_practice_follow_up_questions_source_run UNIQUE (source_agent_run_id);


--
-- Name: practice_recommendations uq_practice_recommendations_attempt; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_recommendations
    ADD CONSTRAINT uq_practice_recommendations_attempt UNIQUE (attempt_id);


--
-- Name: practice_recommendations uq_practice_recommendations_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_recommendations
    ADD CONSTRAINT uq_practice_recommendations_source_run UNIQUE (source_agent_run_id);


--
-- Name: practice_reviews uq_practice_reviews_attempt; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_reviews
    ADD CONSTRAINT uq_practice_reviews_attempt UNIQUE (attempt_id);


--
-- Name: practice_reviews uq_practice_reviews_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_reviews
    ADD CONSTRAINT uq_practice_reviews_source_run UNIQUE (source_agent_run_id);


--
-- Name: practice_sessions uq_practice_sessions_user_id_id; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_sessions
    ADD CONSTRAINT uq_practice_sessions_user_id_id UNIQUE (user_id, id);


--
-- Name: question_cards uq_question_cards_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.question_cards
    ADD CONSTRAINT uq_question_cards_source_run UNIQUE (source_agent_run_id);


--
-- Name: resume_documents uq_resume_documents_storage_key; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_documents
    ADD CONSTRAINT uq_resume_documents_storage_key UNIQUE (storage_key);


--
-- Name: resume_documents uq_resume_documents_user_id_id; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_documents
    ADD CONSTRAINT uq_resume_documents_user_id_id UNIQUE (user_id, id);


--
-- Name: resume_import_drafts uq_resume_import_drafts_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_import_drafts
    ADD CONSTRAINT uq_resume_import_drafts_source_run UNIQUE (source_agent_run_id);


--
-- Name: resume_parsing_results uq_resume_parsing_results_source_run; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_parsing_results
    ADD CONSTRAINT uq_resume_parsing_results_source_run UNIQUE (source_agent_run_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_agent_runs_expired_running; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_agent_runs_expired_running ON public.agent_runs USING btree (lease_expires_at, id) WHERE ((status)::text = 'running'::text);


--
-- Name: ix_agent_runs_queued_available; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_agent_runs_queued_available ON public.agent_runs USING btree (status, available_at, created_at, id) WHERE ((status)::text = 'queued'::text);


--
-- Name: ix_agent_runs_user_created; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_agent_runs_user_created ON public.agent_runs USING btree (user_id, created_at, id);


--
-- Name: ix_auth_sessions_expires_at; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_auth_sessions_expires_at ON public.auth_sessions USING btree (expires_at);


--
-- Name: ix_auth_sessions_token_digest; Type: INDEX; Schema: public; Owner: riva
--

CREATE UNIQUE INDEX ix_auth_sessions_token_digest ON public.auth_sessions USING btree (token_digest);


--
-- Name: ix_auth_sessions_user_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_auth_sessions_user_id ON public.auth_sessions USING btree (user_id);


--
-- Name: ix_career_profile_educations_career_profile_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_educations_career_profile_id ON public.career_profile_educations USING btree (career_profile_id);


--
-- Name: ix_career_profile_project_experiences_career_profile_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_project_experiences_career_profile_id ON public.career_profile_project_experiences USING btree (career_profile_id);


--
-- Name: ix_career_profile_project_skills_career_profile_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_project_skills_career_profile_id ON public.career_profile_project_skills USING btree (career_profile_id);


--
-- Name: ix_career_profile_project_skills_project_experience_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_project_skills_project_experience_id ON public.career_profile_project_skills USING btree (project_experience_id);


--
-- Name: ix_career_profile_project_skills_skill_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_project_skills_skill_id ON public.career_profile_project_skills USING btree (skill_id);


--
-- Name: ix_career_profile_skills_career_profile_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_skills_career_profile_id ON public.career_profile_skills USING btree (career_profile_id);


--
-- Name: ix_career_profile_work_experiences_career_profile_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_work_experiences_career_profile_id ON public.career_profile_work_experiences USING btree (career_profile_id);


--
-- Name: ix_career_profile_work_skills_career_profile_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_work_skills_career_profile_id ON public.career_profile_work_skills USING btree (career_profile_id);


--
-- Name: ix_career_profile_work_skills_skill_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_work_skills_skill_id ON public.career_profile_work_skills USING btree (skill_id);


--
-- Name: ix_career_profile_work_skills_work_experience_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_career_profile_work_skills_work_experience_id ON public.career_profile_work_skills USING btree (work_experience_id);


--
-- Name: ix_career_profiles_user_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE UNIQUE INDEX ix_career_profiles_user_id ON public.career_profiles USING btree (user_id);


--
-- Name: ix_job_description_analyses_user_role; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_job_description_analyses_user_role ON public.job_description_analyses USING btree (user_id, role_id);


--
-- Name: ix_matching_analyses_user_profile; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_matching_analyses_user_profile ON public.matching_analyses USING btree (user_id, profile_id);


--
-- Name: ix_matching_analyses_user_role; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_matching_analyses_user_role ON public.matching_analyses USING btree (user_id, role_id);


--
-- Name: ix_practice_answers_attempt_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_practice_answers_attempt_id ON public.practice_answers USING btree (attempt_id);


--
-- Name: ix_practice_evaluations_attempt_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_practice_evaluations_attempt_id ON public.practice_evaluations USING btree (attempt_id);


--
-- Name: ix_practice_follow_up_decisions_attempt_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_practice_follow_up_decisions_attempt_id ON public.practice_follow_up_decisions USING btree (attempt_id);


--
-- Name: ix_practice_follow_up_questions_attempt_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_practice_follow_up_questions_attempt_id ON public.practice_follow_up_questions USING btree (attempt_id);


--
-- Name: ix_practice_recommendations_attempt_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_practice_recommendations_attempt_id ON public.practice_recommendations USING btree (attempt_id);


--
-- Name: ix_practice_reviews_attempt_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_practice_reviews_attempt_id ON public.practice_reviews USING btree (attempt_id);


--
-- Name: ix_practice_sessions_user_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_practice_sessions_user_id ON public.practice_sessions USING btree (user_id);


--
-- Name: ix_question_cards_matching_analysis_run_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_question_cards_matching_analysis_run_id ON public.question_cards USING btree (matching_analysis_run_id);


--
-- Name: ix_question_cards_user_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_question_cards_user_id ON public.question_cards USING btree (user_id);


--
-- Name: ix_question_cards_user_profile; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_question_cards_user_profile ON public.question_cards USING btree (user_id, profile_id);


--
-- Name: ix_question_cards_user_target_role; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_question_cards_user_target_role ON public.question_cards USING btree (user_id, target_role_id);


--
-- Name: ix_resume_documents_extraction_status; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_resume_documents_extraction_status ON public.resume_documents USING btree (extraction_status);


--
-- Name: ix_resume_documents_parsing_run_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE UNIQUE INDEX ix_resume_documents_parsing_run_id ON public.resume_documents USING btree (parsing_run_id);


--
-- Name: ix_resume_documents_user_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_resume_documents_user_id ON public.resume_documents USING btree (user_id);


--
-- Name: ix_resume_documents_user_uploaded_at; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_resume_documents_user_uploaded_at ON public.resume_documents USING btree (user_id, uploaded_at);


--
-- Name: ix_resume_import_drafts_user_document; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_resume_import_drafts_user_document ON public.resume_import_drafts USING btree (user_id, resume_document_id);


--
-- Name: ix_resume_import_drafts_user_status_updated_at; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_resume_import_drafts_user_status_updated_at ON public.resume_import_drafts USING btree (user_id, status, updated_at);


--
-- Name: ix_resume_parsing_results_parsed_at; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_resume_parsing_results_parsed_at ON public.resume_parsing_results USING btree (parsed_at);


--
-- Name: ix_resume_parsing_results_user_document; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_resume_parsing_results_user_document ON public.resume_parsing_results USING btree (user_id, resume_document_id);


--
-- Name: ix_target_roles_job_description_parsing_run_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_target_roles_job_description_parsing_run_id ON public.target_roles USING btree (job_description_parsing_run_id);


--
-- Name: ix_target_roles_matching_analysis_run_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_target_roles_matching_analysis_run_id ON public.target_roles USING btree (matching_analysis_run_id);


--
-- Name: ix_target_roles_user_id; Type: INDEX; Schema: public; Owner: riva
--

CREATE INDEX ix_target_roles_user_id ON public.target_roles USING btree (user_id);


--
-- Name: ix_users_normalized_username; Type: INDEX; Schema: public; Owner: riva
--

CREATE UNIQUE INDEX ix_users_normalized_username ON public.users USING btree (normalized_username);


--
-- Name: agent_runs agent_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: auth_sessions auth_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: career_profile_educations career_profile_educations_career_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_educations
    ADD CONSTRAINT career_profile_educations_career_profile_id_fkey FOREIGN KEY (career_profile_id) REFERENCES public.career_profiles(id) ON DELETE CASCADE;


--
-- Name: career_profile_project_experiences career_profile_project_experiences_career_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_experiences
    ADD CONSTRAINT career_profile_project_experiences_career_profile_id_fkey FOREIGN KEY (career_profile_id) REFERENCES public.career_profiles(id) ON DELETE CASCADE;


--
-- Name: career_profile_project_skills career_profile_project_skills_career_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_skills
    ADD CONSTRAINT career_profile_project_skills_career_profile_id_fkey FOREIGN KEY (career_profile_id) REFERENCES public.career_profiles(id) ON DELETE CASCADE;


--
-- Name: career_profile_project_skills career_profile_project_skills_project_experience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_skills
    ADD CONSTRAINT career_profile_project_skills_project_experience_id_fkey FOREIGN KEY (project_experience_id) REFERENCES public.career_profile_project_experiences(id) ON DELETE CASCADE;


--
-- Name: career_profile_project_skills career_profile_project_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_project_skills
    ADD CONSTRAINT career_profile_project_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.career_profile_skills(id) ON DELETE CASCADE;


--
-- Name: career_profile_skills career_profile_skills_career_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_skills
    ADD CONSTRAINT career_profile_skills_career_profile_id_fkey FOREIGN KEY (career_profile_id) REFERENCES public.career_profiles(id) ON DELETE CASCADE;


--
-- Name: career_profile_work_experiences career_profile_work_experiences_career_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_experiences
    ADD CONSTRAINT career_profile_work_experiences_career_profile_id_fkey FOREIGN KEY (career_profile_id) REFERENCES public.career_profiles(id) ON DELETE CASCADE;


--
-- Name: career_profile_work_skills career_profile_work_skills_career_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_skills
    ADD CONSTRAINT career_profile_work_skills_career_profile_id_fkey FOREIGN KEY (career_profile_id) REFERENCES public.career_profiles(id) ON DELETE CASCADE;


--
-- Name: career_profile_work_skills career_profile_work_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_skills
    ADD CONSTRAINT career_profile_work_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.career_profile_skills(id) ON DELETE CASCADE;


--
-- Name: career_profile_work_skills career_profile_work_skills_work_experience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profile_work_skills
    ADD CONSTRAINT career_profile_work_skills_work_experience_id_fkey FOREIGN KEY (work_experience_id) REFERENCES public.career_profile_work_experiences(id) ON DELETE CASCADE;


--
-- Name: career_profiles career_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.career_profiles
    ADD CONSTRAINT career_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: current_target_roles current_target_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.current_target_roles
    ADD CONSTRAINT current_target_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: current_target_roles current_target_roles_user_id_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.current_target_roles
    ADD CONSTRAINT current_target_roles_user_id_role_id_fkey FOREIGN KEY (user_id, role_id) REFERENCES public.target_roles(user_id, id) ON DELETE CASCADE;


--
-- Name: job_description_analyses fk_job_description_analyses_role_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.job_description_analyses
    ADD CONSTRAINT fk_job_description_analyses_role_owner FOREIGN KEY (user_id, role_id) REFERENCES public.target_roles(user_id, id) ON DELETE CASCADE;


--
-- Name: matching_analyses fk_matching_analyses_profile_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.matching_analyses
    ADD CONSTRAINT fk_matching_analyses_profile_owner FOREIGN KEY (user_id, profile_id) REFERENCES public.career_profiles(user_id, id) ON DELETE CASCADE;


--
-- Name: matching_analyses fk_matching_analyses_role_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.matching_analyses
    ADD CONSTRAINT fk_matching_analyses_role_owner FOREIGN KEY (user_id, role_id) REFERENCES public.target_roles(user_id, id) ON DELETE CASCADE;


--
-- Name: practice_attempts fk_practice_attempts_session_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_attempts
    ADD CONSTRAINT fk_practice_attempts_session_owner FOREIGN KEY (user_id, session_id) REFERENCES public.practice_sessions(user_id, id) ON DELETE CASCADE;


--
-- Name: practice_sessions fk_practice_sessions_target_role_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_sessions
    ADD CONSTRAINT fk_practice_sessions_target_role_owner FOREIGN KEY (user_id, target_role_id) REFERENCES public.target_roles(user_id, id) ON DELETE CASCADE;


--
-- Name: question_cards fk_question_cards_profile_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.question_cards
    ADD CONSTRAINT fk_question_cards_profile_owner FOREIGN KEY (user_id, profile_id) REFERENCES public.career_profiles(user_id, id) ON DELETE CASCADE;


--
-- Name: question_cards fk_question_cards_target_role_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.question_cards
    ADD CONSTRAINT fk_question_cards_target_role_owner FOREIGN KEY (user_id, target_role_id) REFERENCES public.target_roles(user_id, id) ON DELETE CASCADE;


--
-- Name: resume_import_drafts fk_resume_import_drafts_document_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_import_drafts
    ADD CONSTRAINT fk_resume_import_drafts_document_owner FOREIGN KEY (user_id, resume_document_id) REFERENCES public.resume_documents(user_id, id) ON DELETE CASCADE;


--
-- Name: resume_parsing_results fk_resume_parsing_results_document_owner; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_parsing_results
    ADD CONSTRAINT fk_resume_parsing_results_document_owner FOREIGN KEY (user_id, resume_document_id) REFERENCES public.resume_documents(user_id, id) ON DELETE CASCADE;


--
-- Name: job_description_analyses job_description_analyses_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.job_description_analyses
    ADD CONSTRAINT job_description_analyses_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id);


--
-- Name: matching_analyses matching_analyses_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.matching_analyses
    ADD CONSTRAINT matching_analyses_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: practice_answers practice_answers_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_answers
    ADD CONSTRAINT practice_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.practice_attempts(id) ON DELETE CASCADE;


--
-- Name: practice_answers practice_answers_follow_up_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_answers
    ADD CONSTRAINT practice_answers_follow_up_question_id_fkey FOREIGN KEY (follow_up_question_id) REFERENCES public.practice_follow_up_questions(id) ON DELETE CASCADE;


--
-- Name: practice_attempts practice_attempts_question_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_attempts
    ADD CONSTRAINT practice_attempts_question_card_id_fkey FOREIGN KEY (question_card_id) REFERENCES public.question_cards(id) ON DELETE SET NULL;


--
-- Name: practice_attempts practice_attempts_question_generation_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_attempts
    ADD CONSTRAINT practice_attempts_question_generation_run_id_fkey FOREIGN KEY (question_generation_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;


--
-- Name: practice_attempts practice_attempts_retry_of_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_attempts
    ADD CONSTRAINT practice_attempts_retry_of_attempt_id_fkey FOREIGN KEY (retry_of_attempt_id) REFERENCES public.practice_attempts(id) ON DELETE SET NULL;


--
-- Name: practice_evaluations practice_evaluations_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_evaluations
    ADD CONSTRAINT practice_evaluations_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.practice_attempts(id) ON DELETE CASCADE;


--
-- Name: practice_evaluations practice_evaluations_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_evaluations
    ADD CONSTRAINT practice_evaluations_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: practice_follow_up_decisions practice_follow_up_decisions_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_decisions
    ADD CONSTRAINT practice_follow_up_decisions_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.practice_attempts(id) ON DELETE CASCADE;


--
-- Name: practice_follow_up_decisions practice_follow_up_decisions_follow_up_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_decisions
    ADD CONSTRAINT practice_follow_up_decisions_follow_up_question_id_fkey FOREIGN KEY (follow_up_question_id) REFERENCES public.practice_follow_up_questions(id) ON DELETE CASCADE;


--
-- Name: practice_follow_up_decisions practice_follow_up_decisions_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_decisions
    ADD CONSTRAINT practice_follow_up_decisions_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: practice_follow_up_questions practice_follow_up_questions_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_questions
    ADD CONSTRAINT practice_follow_up_questions_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.practice_attempts(id) ON DELETE CASCADE;


--
-- Name: practice_follow_up_questions practice_follow_up_questions_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_follow_up_questions
    ADD CONSTRAINT practice_follow_up_questions_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: practice_recommendations practice_recommendations_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_recommendations
    ADD CONSTRAINT practice_recommendations_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.practice_attempts(id) ON DELETE CASCADE;


--
-- Name: practice_recommendations practice_recommendations_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_recommendations
    ADD CONSTRAINT practice_recommendations_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: practice_reviews practice_reviews_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_reviews
    ADD CONSTRAINT practice_reviews_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.practice_attempts(id) ON DELETE CASCADE;


--
-- Name: practice_reviews practice_reviews_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_reviews
    ADD CONSTRAINT practice_reviews_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: practice_sessions practice_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.practice_sessions
    ADD CONSTRAINT practice_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: question_cards question_cards_matching_analysis_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.question_cards
    ADD CONSTRAINT question_cards_matching_analysis_run_id_fkey FOREIGN KEY (matching_analysis_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: question_cards question_cards_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.question_cards
    ADD CONSTRAINT question_cards_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: question_cards question_cards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.question_cards
    ADD CONSTRAINT question_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: resume_documents resume_documents_parsing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_documents
    ADD CONSTRAINT resume_documents_parsing_run_id_fkey FOREIGN KEY (parsing_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;


--
-- Name: resume_documents resume_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_documents
    ADD CONSTRAINT resume_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: resume_import_drafts resume_import_drafts_resume_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_import_drafts
    ADD CONSTRAINT resume_import_drafts_resume_document_id_fkey FOREIGN KEY (resume_document_id) REFERENCES public.resume_parsing_results(resume_document_id) ON DELETE CASCADE;


--
-- Name: resume_import_drafts resume_import_drafts_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_import_drafts
    ADD CONSTRAINT resume_import_drafts_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id);


--
-- Name: resume_parsing_results resume_parsing_results_source_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.resume_parsing_results
    ADD CONSTRAINT resume_parsing_results_source_agent_run_id_fkey FOREIGN KEY (source_agent_run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: target_roles target_roles_job_description_parsing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.target_roles
    ADD CONSTRAINT target_roles_job_description_parsing_run_id_fkey FOREIGN KEY (job_description_parsing_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;


--
-- Name: target_roles target_roles_matching_analysis_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.target_roles
    ADD CONSTRAINT target_roles_matching_analysis_run_id_fkey FOREIGN KEY (matching_analysis_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;


--
-- Name: target_roles target_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: riva
--

ALTER TABLE ONLY public.target_roles
    ADD CONSTRAINT target_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict c88wbzqyiSZbCoveOaFIb4f0f6ulUb9nAraLWPMENsS6X1vpF3lxb2pxgWqMLG9

