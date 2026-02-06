-- WARNING: This schema is for context only and is not meant to be run.

-- 1. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. INDEPENDENT & BASE TABLES
CREATE TABLE public.subscription_plans (
  plan_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL UNIQUE,
  monthly_price numeric NOT NULL DEFAULT 0,
  features_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscription_plans_pkey PRIMARY KEY (plan_id)
);

CREATE TABLE public.organizations (
  organization_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  plan_id uuid,
  organization_name character varying NOT NULL,
  organization_size character varying,
  business_domain character varying,
  admin_email character varying NOT NULL UNIQUE,
  admin_password_hash character varying NOT NULL,
  subscription_status character varying DEFAULT 'active'::character varying CHECK (subscription_status::text = ANY (ARRAY['active'::text, 'cancelled'::text, 'past_due'::text, 'trial'::text])),
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  CONSTRAINT organizations_pkey PRIMARY KEY (organization_id),
  CONSTRAINT organizations_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(plan_id)
);

CREATE TABLE public.organization_departments (
  department_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  name character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organization_departments_pkey PRIMARY KEY (department_id),
  CONSTRAINT organization_departments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id)
);

CREATE TABLE public.organization_users (
  user_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  department_id uuid,
  email character varying NOT NULL,
  password_hash character varying NOT NULL,
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['admin'::text, 'hr'::text, 'technical'::text, 'viewer'::text])),
  status character varying DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::text, 'inactive'::text, 'pending'::text, 'suspended'::text, 'deleted'::text])),
  avatar_url character varying,
  created_at timestamp with time zone DEFAULT now(),
  last_login_at timestamp with time zone,
  is_deleted boolean DEFAULT false,
  CONSTRAINT organization_users_pkey PRIMARY KEY (user_id),
  CONSTRAINT organization_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT organization_users_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.organization_departments(department_id)
);

-- 3. CANDIDATE & PROJECT CORE
CREATE TABLE public.candidate_profiles (
  candidate_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  email character varying NOT NULL,
  full_name character varying NOT NULL,
  phone character varying,
  location character varying,
  linkedin_url character varying,
  github_url character varying,
  portfolio_url character varying,
  password_hash character varying,
  avatar_url character varying,
  created_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  CONSTRAINT candidate_profiles_pkey PRIMARY KEY (candidate_id),
  CONSTRAINT candidate_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id)
);

CREATE TABLE public.projects (
  project_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  name character varying NOT NULL,
  description text,
  status character varying DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::text, 'closed'::text, 'archived'::text])),
  target_hire_count integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  is_deleted boolean DEFAULT false,
  CONSTRAINT projects_pkey PRIMARY KEY (project_id),
  CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT projects_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.positions (
  position_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  job_title character varying NOT NULL,
  job_description text NOT NULL,
  required_skills jsonb DEFAULT '[]'::jsonb,
  experience_level character varying CHECK (experience_level::text = ANY (ARRAY['junior'::text, 'mid'::text, 'senior'::text, 'lead'::text, 'any'::text])),
  work_type character varying CHECK (work_type::text = ANY (ARRAY['remote'::text, 'hybrid'::text, 'onsite'::text])),
  location character varying,
  salary_min numeric,
  salary_max numeric,
  salary_currency character varying DEFAULT 'USD'::character varying,
  status character varying DEFAULT 'open'::character varying CHECK (status::text = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'archived'::text])),
  assigned_hr_id uuid,
  assigned_tech_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  job_description_embedding vector(1536),
  CONSTRAINT positions_pkey PRIMARY KEY (position_id),
  CONSTRAINT positions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id),
  CONSTRAINT positions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT positions_assigned_hr_id_fkey FOREIGN KEY (assigned_hr_id) REFERENCES public.organization_users(user_id),
  CONSTRAINT positions_assigned_tech_id_fkey FOREIGN KEY (assigned_tech_id) REFERENCES public.organization_users(user_id)
);

-- 4. APPLICATIONS & RECRUITMENT FLOW
CREATE TABLE public.candidate_groups (
  group_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  position_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  group_name character varying NOT NULL,
  assigned_hr_id uuid,
  assigned_tech_id uuid,
  filtration_flow jsonb NOT NULL DEFAULT '[]'::jsonb,
  status character varying DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::text, 'closed'::text, 'archived'::text])),
  created_at timestamp with time zone DEFAULT now(),
  created_by_user_id uuid,
  CONSTRAINT candidate_groups_pkey PRIMARY KEY (group_id),
  CONSTRAINT candidate_groups_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(position_id),
  CONSTRAINT candidate_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT candidate_groups_assigned_hr_id_fkey FOREIGN KEY (assigned_hr_id) REFERENCES public.organization_users(user_id),
  CONSTRAINT candidate_groups_assigned_tech_id_fkey FOREIGN KEY (assigned_tech_id) REFERENCES public.organization_users(user_id),
  CONSTRAINT candidate_groups_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.candidate_applications (
  application_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  candidate_id uuid NOT NULL,
  position_id uuid NOT NULL,
  group_id uuid,
  organization_id uuid NOT NULL,
  resume_url character varying,
  cover_letter text,
  source character varying,
  status character varying DEFAULT 'applied'::character varying CHECK (status::text = ANY (ARRAY['applied'::text, 'screening'::text, 'in_pipeline'::text, 'offered'::text, 'hired'::text, 'rejected'::text, 'withdrawn'::text])),
  applied_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  CONSTRAINT candidate_applications_pkey PRIMARY KEY (application_id),
  CONSTRAINT candidate_applications_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidate_profiles(candidate_id),
  CONSTRAINT candidate_applications_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(position_id),
  CONSTRAINT candidate_applications_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.candidate_groups(group_id),
  CONSTRAINT candidate_applications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id)
);

-- 5. ANALYSIS TABLES
CREATE TABLE public.cv_analysis (
  analysis_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  cv_file_url character varying,
  parsed_data jsonb DEFAULT '{}'::jsonb,
  skills text[] DEFAULT '{}',
  experience_years numeric,
  education jsonb DEFAULT '[]'::jsonb,
  work_history jsonb DEFAULT '[]'::jsonb,
  match_score numeric,
  skill_gap_analysis text,
  analyzed_at timestamp with time zone DEFAULT now(),
  cv_embedding vector(1536),
  CONSTRAINT cv_analysis_pkey PRIMARY KEY (analysis_id),
  CONSTRAINT cv_analysis_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id),
  CONSTRAINT cv_analysis_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id)
);

CREATE TABLE public.github_analysis (
  analysis_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  candidate_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  github_url character varying,
  github_username character varying,
  top_languages jsonb DEFAULT '[]'::jsonb,
  repo_count integer,
  total_stars integer,
  total_forks integer,
  contribution_score numeric,
  code_quality_score numeric,
  documentation_score numeric,
  activity_score numeric,
  analysis_data jsonb DEFAULT '{}'::jsonb,
  notable_repos jsonb DEFAULT '[]'::jsonb,
  analyzed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT github_analysis_pkey PRIMARY KEY (analysis_id),
  CONSTRAINT github_analysis_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidate_profiles(candidate_id),
  CONSTRAINT github_analysis_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id)
);

-- 6. QUESTION BANK & CONFIGS
CREATE TABLE public.question_bank (
  question_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  question_type character varying NOT NULL CHECK (question_type::text = ANY (ARRAY['mcq'::text, 'essay'::text, 'coding'::text])),
  question_text text NOT NULL,
  question_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  correct_answer jsonb,
  category character varying,
  difficulty integer CHECK (difficulty >= 1 AND difficulty <= 5),
  tags text[] DEFAULT '{}',
  points integer DEFAULT 10,
  created_by_user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  usage_count integer DEFAULT 0,
  is_deleted boolean DEFAULT false,
  question_embedding vector(1536),
  CONSTRAINT question_bank_pkey PRIMARY KEY (question_id),
  CONSTRAINT question_bank_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT question_bank_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.assessments (
  assessment_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  position_id uuid,
  title character varying NOT NULL,
  instructions text,
  duration_minutes integer DEFAULT 60,
  passing_score numeric DEFAULT 60.00,
  shuffle_sections boolean DEFAULT false,
  anti_cheating_enabled boolean DEFAULT true,
  structure jsonb NOT NULL DEFAULT '{"sections": []}'::jsonb,
  status character varying DEFAULT 'draft'::character varying CHECK (status::text = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
  created_by_user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  CONSTRAINT assessments_pkey PRIMARY KEY (assessment_id),
  CONSTRAINT assessments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT assessments_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(position_id),
  CONSTRAINT assessments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.ai_interview_configs (
  config_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  position_id uuid,
  title character varying NOT NULL,
  interview_type character varying NOT NULL CHECK (interview_type::text = ANY (ARRAY['recorded'::text, 'live_ai'::text])),
  instructions text,
  max_retakes integer DEFAULT 1,
  think_time_seconds integer DEFAULT 30,
  answer_time_seconds integer DEFAULT 120,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  live_interview_context text,
  created_by_user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  CONSTRAINT ai_interview_configs_pkey PRIMARY KEY (config_id),
  CONSTRAINT ai_interview_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT ai_interview_configs_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(position_id),
  CONSTRAINT ai_interview_configs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.organization_users(user_id)
);

-- 7. ONGOING SESSIONS
CREATE TABLE public.ongoing_assessments (
  session_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  assessment_id uuid NOT NULL,
  application_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  assigned_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status character varying DEFAULT 'not_started'::character varying CHECK (status::text = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'submitted'::text, 'grading'::text, 'graded'::text])),
  started_at timestamp with time zone,
  submitted_at timestamp with time zone,
  time_spent_seconds integer,
  total_score numeric,
  total_points integer,
  max_points integer,
  flag_count integer DEFAULT 0,
  recording_url character varying,
  browser_info jsonb,
  ip_address inet,
  CONSTRAINT ongoing_assessments_pkey PRIMARY KEY (session_id),
  CONSTRAINT ongoing_assessments_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(assessment_id),
  CONSTRAINT ongoing_assessments_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id),
  CONSTRAINT ongoing_assessments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id)
);

CREATE TABLE public.ongoing_interviews (
  session_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  config_id uuid NOT NULL,
  application_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  interview_type character varying NOT NULL CHECK (interview_type::text = ANY (ARRAY['recorded'::text, 'live_ai'::text])),
  status character varying DEFAULT 'not_started'::character varying CHECK (status::text = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'analyzing'::text, 'analyzed'::text])),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  overall_score numeric,
  technical_score numeric,
  communication_score numeric,
  confidence_score numeric,
  ai_analysis jsonb,
  ai_recommendation character varying,
  recording_url character varying,
  flag_count integer DEFAULT 0,
  CONSTRAINT ongoing_interviews_pkey PRIMARY KEY (session_id),
  CONSTRAINT ongoing_interviews_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT ongoing_interviews_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.ai_interview_configs(config_id),
  CONSTRAINT ongoing_interviews_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id)
);

-- 8. RESPONSE & PROGRESS TABLES
CREATE TABLE public.ai_interview_turns (
  turn_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL,
  turn_number integer NOT NULL,
  speaker character varying NOT NULL CHECK (speaker::text = ANY (ARRAY['ai'::text, 'candidate'::text])),
  content text,
  audio_url character varying,
  duration_seconds integer,
  transcript text,
  transcript_confidence numeric,
  ai_model_used character varying,
  analysis jsonb,
  emotion_analysis jsonb,
  created_at timestamp with time zone DEFAULT now(),
  content_embedding vector(1536),
  CONSTRAINT ai_interview_turns_pkey PRIMARY KEY (turn_id),
  CONSTRAINT ai_interview_turns_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ongoing_interviews(session_id)
);

CREATE TABLE public.candidate_answers (
  answer_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL,
  question_id uuid NOT NULL,
  question_order integer NOT NULL,
  answer_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_correct boolean,
  points_earned numeric DEFAULT 0,
  points_max integer NOT NULL,
  time_spent_seconds integer,
  answered_at timestamp with time zone DEFAULT now(),
  graded_at timestamp with time zone,
  graded_by character varying,
  CONSTRAINT candidate_answers_pkey PRIMARY KEY (answer_id),
  CONSTRAINT candidate_answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ongoing_assessments(session_id),
  CONSTRAINT candidate_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.question_bank(question_id)
);

CREATE TABLE public.candidate_stage_progress (
  progress_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL,
  group_id uuid NOT NULL,
  stage_type character varying NOT NULL CHECK (stage_type::text = ANY (ARRAY['assessment'::text, 'ai_interview'::text, 'live_interview'::text])),
  stage_order integer NOT NULL,
  status character varying DEFAULT 'locked'::character varying CHECK (status::text = ANY (ARRAY['locked'::text, 'unlocked'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'skipped'::text])),
  session_id uuid,
  score numeric,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT candidate_stage_progress_pkey PRIMARY KEY (progress_id),
  CONSTRAINT candidate_stage_progress_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.candidate_groups(group_id),
  CONSTRAINT fk_stage_progress_application FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id)
);

CREATE TABLE public.interview_responses (
  response_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL,
  question_id character varying NOT NULL,
  question_order integer NOT NULL,
  question_text text NOT NULL,
  video_url character varying,
  audio_url character varying,
  transcript text,
  transcript_confidence numeric,
  retake_number integer DEFAULT 1,
  duration_seconds integer,
  ai_score numeric,
  ai_feedback jsonb,
  emotion_analysis jsonb,
  answered_at timestamp with time zone DEFAULT now(),
  response_embedding vector(1536),
  CONSTRAINT interview_responses_pkey PRIMARY KEY (response_id),
  CONSTRAINT interview_responses_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ongoing_interviews(session_id)
);

-- 9. LIVE INTERVIEWING
CREATE TABLE public.live_interview_configs (
  config_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  position_id uuid,
  title character varying NOT NULL,
  duration_minutes integer DEFAULT 60,
  interview_type character varying DEFAULT 'technical'::character varying CHECK (interview_type::text = ANY (ARRAY['technical'::text, 'behavioral'::text, 'hr'::text, 'panel'::text])),
  instructions text,
  suggested_questions jsonb DEFAULT '[]'::jsonb,
  scoring_rubric jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  CONSTRAINT live_interview_configs_pkey PRIMARY KEY (config_id),
  CONSTRAINT live_interview_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT live_interview_configs_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(position_id)
);

CREATE TABLE public.live_interview_sessions (
  session_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  config_id uuid NOT NULL,
  application_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  interviewer_id uuid,
  scheduled_at timestamp with time zone,
  meeting_link character varying,
  meeting_provider character varying,
  status character varying DEFAULT 'scheduled'::character varying CHECK (status::text = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text, 'rescheduled'::text])),
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  recording_url character varying,
  transcript text,
  ai_analysis jsonb,
  interviewer_notes text,
  interviewer_rating numeric CHECK (interviewer_rating >= 0::numeric AND interviewer_rating <= 5::numeric),
  interviewer_decision character varying CHECK (interviewer_decision::text = ANY (ARRAY['strong_hire'::text, 'hire'::text, 'maybe'::text, 'no_hire'::text, 'strong_no_hire'::text])),
  feedback_submitted_at timestamp with time zone,
  CONSTRAINT live_interview_sessions_pkey PRIMARY KEY (session_id),
  CONSTRAINT live_interview_sessions_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.live_interview_configs(config_id),
  CONSTRAINT live_interview_sessions_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id),
  CONSTRAINT live_interview_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT live_interview_sessions_interviewer_id_fkey FOREIGN KEY (interviewer_id) REFERENCES public.organization_users(user_id)
);

-- 10. OFFERS, HIRES & ACCESS
CREATE TABLE public.offers (
  offer_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  position_id uuid NOT NULL,
  salary_offered numeric,
  salary_currency character varying DEFAULT 'USD'::character varying,
  bonus_offered numeric,
  equity_offered character varying,
  start_date date,
  offer_details jsonb DEFAULT '{}'::jsonb,
  offer_letter_url character varying,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['draft'::text, 'pending'::text, 'sent'::text, 'viewed'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'withdrawn'::text])),
  created_by_user_id uuid,
  offered_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  responded_at timestamp with time zone,
  decline_reason text,
  CONSTRAINT offers_pkey PRIMARY KEY (offer_id),
  CONSTRAINT offers_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id),
  CONSTRAINT offers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT offers_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(position_id),
  CONSTRAINT offers_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.hires (
  hire_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  position_id uuid NOT NULL,
  offer_id uuid,
  final_salary numeric,
  salary_currency character varying DEFAULT 'USD'::character varying,
  start_date date,
  employee_id character varying,
  onboarding_status character varying DEFAULT 'pending'::character varying,
  hired_by_user_id uuid,
  hired_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hires_pkey PRIMARY KEY (hire_id),
  CONSTRAINT hires_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id),
  CONSTRAINT hires_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT hires_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(position_id),
  CONSTRAINT hires_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(offer_id),
  CONSTRAINT hires_hired_by_user_id_fkey FOREIGN KEY (hired_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.project_access (
  access_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  access_level character varying DEFAULT 'view'::character varying CHECK (access_level::text = ANY (ARRAY['view'::text, 'edit'::text, 'admin'::text])),
  granted_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_access_pkey PRIMARY KEY (access_id),
  CONSTRAINT project_access_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id),
  CONSTRAINT project_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(user_id)
);

-- 11. LOGGING & UTILITIES
CREATE TABLE public.email_logs (
  email_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  recipient_email character varying NOT NULL,
  recipient_name character varying,
  subject character varying NOT NULL,
  template_type character varying,
  template_data jsonb,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'bounced'::text])),
  provider_message_id character varying,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT email_logs_pkey PRIMARY KEY (email_id),
  CONSTRAINT email_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id)
);

CREATE TABLE public.notifications (
  notification_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  recipient_user_id uuid,
  recipient_candidate_id uuid,
  type character varying NOT NULL,
  title character varying NOT NULL,
  message text,
  data jsonb DEFAULT '{}'::jsonb,
  action_url character varying,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (notification_id),
  CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.organization_users(user_id),
  CONSTRAINT notifications_recipient_candidate_id_fkey FOREIGN KEY (recipient_candidate_id) REFERENCES public.candidate_profiles(candidate_id)
);

CREATE TABLE public.payment_methods (
  payment_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  card_brand character varying,
  last4 character varying NOT NULL,
  expiry_date character varying NOT NULL,
  is_default boolean DEFAULT false,
  stripe_payment_method_id character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_methods_pkey PRIMARY KEY (payment_id),
  CONSTRAINT payment_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id)
);

CREATE TABLE public.pipeline_transitions (
  transition_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  from_status character varying,
  to_status character varying NOT NULL,
  from_stage character varying,
  to_stage character varying,
  triggered_by_user_id uuid,
  trigger_type character varying DEFAULT 'manual'::character varying,
  reason text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pipeline_transitions_pkey PRIMARY KEY (transition_id),
  CONSTRAINT pipeline_transitions_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id),
  CONSTRAINT pipeline_transitions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT pipeline_transitions_triggered_by_user_id_fkey FOREIGN KEY (triggered_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.proctoring_flags (
  flag_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL,
  session_id uuid NOT NULL,
  session_type character varying NOT NULL CHECK (session_type::text = ANY (ARRAY['assessment'::text, 'ai_interview'::text])),
  organization_id uuid NOT NULL,
  timestamp_seconds integer NOT NULL,
  time_display character varying,
  event_type character varying NOT NULL,
  severity character varying NOT NULL CHECK (severity::text = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])),
  evidence text,
  screenshot_url character varying,
  detected_by character varying,
  confidence_score numeric,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::text, 'cleared'::text, 'escalated'::text, 'confirmed'::text])),
  reviewed_by_user_id uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT proctoring_flags_pkey PRIMARY KEY (flag_id),
  CONSTRAINT proctoring_flags_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id),
  CONSTRAINT proctoring_flags_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT proctoring_flags_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.question_bank_favorites (
  favorite_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  question_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT question_bank_favorites_pkey PRIMARY KEY (favorite_id),
  CONSTRAINT question_bank_favorites_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.question_bank(question_id),
  CONSTRAINT question_bank_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.recruiter_assignment_logs (
  log_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  position_id uuid,
  group_id uuid,
  user_id uuid NOT NULL,
  action character varying NOT NULL CHECK (action::text = ANY (ARRAY['assigned'::text, 'unassigned'::text])),
  assigned_by_user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recruiter_assignment_logs_pkey PRIMARY KEY (log_id),
  CONSTRAINT recruiter_assignment_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT recruiter_assignment_logs_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(position_id),
  CONSTRAINT recruiter_assignment_logs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.candidate_groups(group_id),
  CONSTRAINT recruiter_assignment_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(user_id),
  CONSTRAINT recruiter_assignment_logs_assigned_by_user_id_fkey FOREIGN KEY (assigned_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.recruiter_notes (
  note_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL,
  author_id uuid NOT NULL,
  content text NOT NULL,
  tags text[] DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recruiter_notes_pkey PRIMARY KEY (note_id),
  CONSTRAINT recruiter_notes_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id),
  CONSTRAINT recruiter_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.group_stage_config (
  config_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  group_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  stage_type character varying NOT NULL CHECK (stage_type::text = ANY (ARRAY['assessment'::text, 'ai_interview'::text, 'live_interview'::text])),
  stage_order integer NOT NULL,
  stage_config_id uuid NOT NULL,
  state character varying DEFAULT 'not_started'::character varying CHECK (state::text = ANY (ARRAY['not_started'::text, 'active'::text, 'closed'::text])),
  acceptance_criteria jsonb DEFAULT '{}'::jsonb,
  started_at timestamp with time zone,
  closed_at timestamp with time zone,
  started_by_user_id uuid,
  CONSTRAINT group_stage_config_pkey PRIMARY KEY (config_id),
  CONSTRAINT group_stage_config_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.candidate_groups(group_id),
  CONSTRAINT group_stage_config_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT group_stage_config_started_by_user_id_fkey FOREIGN KEY (started_by_user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.stage_onboarding (
  onboarding_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL,
  stage_type character varying NOT NULL CHECK (stage_type::text = ANY (ARRAY['assessment'::text, 'ai_interview'::text])),
  session_id uuid,
  device_test_passed boolean DEFAULT false,
  camera_test_passed boolean DEFAULT false,
  microphone_test_passed boolean DEFAULT false,
  face_calibration_passed boolean DEFAULT false,
  face_embedding vector(1536),
  face_mesh_data jsonb,
  voice_calibration_passed boolean DEFAULT false,
  voice_embedding vector(1536),
  instructions_accepted boolean DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stage_onboarding_pkey PRIMARY KEY (onboarding_id),
  CONSTRAINT stage_onboarding_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.candidate_applications(application_id)
);

CREATE TABLE public.user_permissions (
  permission_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE,
  can_manage_positions boolean DEFAULT false,
  can_manage_candidates boolean DEFAULT false,
  can_view_analytics boolean DEFAULT true,
  can_export_data boolean DEFAULT false,
  can_manage_users boolean DEFAULT false,
  custom_permissions jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT user_permissions_pkey PRIMARY KEY (permission_id),
  CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(user_id)
);

CREATE TABLE public.system_logs (
  log_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid,
  user_id uuid,
  candidate_id uuid,
  action character varying NOT NULL,
  entity_type character varying,
  entity_id uuid,
  details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT system_logs_pkey PRIMARY KEY (log_id),
  CONSTRAINT system_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(organization_id),
  CONSTRAINT system_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.organization_users(user_id),
  CONSTRAINT system_logs_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidate_profiles(candidate_id)
);
