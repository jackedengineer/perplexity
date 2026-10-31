export const runtimePermissionQuery=`SELECT
      (has_table_privilege(current_user,'run_plans','SELECT') AND has_table_privilege(current_user,'run_plans','INSERT')) AS plan_access,
      has_table_privilege(current_user,'run_plans','UPDATE') AS plan_mutation,
      (has_table_privilege(current_user,'message_feedback','SELECT') AND has_table_privilege(current_user,'message_feedback','INSERT') AND has_column_privilege(current_user,'message_feedback','rating','UPDATE')) AS feedback_access,
      (has_column_privilege(current_user,'message_feedback','user_id','UPDATE') OR has_column_privilege(current_user,'message_feedback','message_id','UPDATE') OR has_column_privilege(current_user,'message_feedback','run_id','UPDATE') OR has_table_privilege(current_user,'message_feedback','DELETE') OR has_column_privilege(current_user,'provider_calls','budget_version','UPDATE')) AS feedback_elevation,
      (SELECT relrowsecurity FROM pg_class WHERE oid='message_feedback'::regclass) AS feedback_rls,
      has_column_privilege(current_user,'runs','deadline_at','UPDATE') AS deadline_write,
      (has_column_privilege(current_user,'provider_calls','cap_micro_usd','UPDATE') OR has_column_privilege(current_user,'provider_calls','stage','UPDATE') OR has_column_privilege(current_user,'provider_calls','run_id','UPDATE') OR has_column_privilege(current_user,'provider_calls','attempt_version','UPDATE')) AS provider_cap_write,
      (has_table_privilege(current_user,'request_rate_buckets','SELECT') AND has_table_privilege(current_user,'request_rate_buckets','INSERT') AND has_column_privilege(current_user,'request_rate_buckets','attempts','UPDATE')) AS request_rate_access,
      (has_column_privilege(current_user,'request_rate_buckets','bucket_key','UPDATE') OR has_column_privilege(current_user,'request_rate_buckets','kind','UPDATE') OR has_column_privilege(current_user,'request_rate_buckets','starts_at','UPDATE') OR has_column_privilege(current_user,'request_rate_buckets','ends_at','UPDATE') OR has_table_privilege(current_user,'request_rate_buckets','DELETE') OR has_table_privilege(current_user,'request_rate_buckets','TRUNCATE') OR has_table_privilege(current_user,'request_rate_buckets','TRIGGER')) AS request_rate_elevation,
      (has_table_privilege(current_user,'run_reconciliations','SELECT') AND has_table_privilege(current_user,'run_reconciliations','INSERT') AND has_table_privilege(current_user,'provider_usage_resolutions','SELECT')) AS reconciliation_access,
      (has_table_privilege(current_user,'run_reconciliations','UPDATE') OR has_table_privilege(current_user,'run_reconciliations','DELETE') OR has_table_privilege(current_user,'run_reconciliations','TRUNCATE') OR has_table_privilege(current_user,'run_reconciliations','TRIGGER') OR has_table_privilege(current_user,'provider_usage_resolutions','INSERT') OR has_table_privilege(current_user,'provider_usage_resolutions','UPDATE') OR has_table_privilege(current_user,'provider_usage_resolutions','DELETE') OR has_table_privilege(current_user,'provider_usage_resolutions','TRUNCATE') OR has_table_privilege(current_user,'provider_usage_resolutions','TRIGGER')) AS reconciliation_elevation,
      (has_table_privilege(current_user,'conversations','SELECT') AND has_table_privilege(current_user,'conversations','INSERT') AND has_table_privilege(current_user,'conversations','UPDATE')) AS conversations,
      has_table_privilege(current_user,'messages','SELECT') AS history,
      has_table_privilege(current_user,'messages','INSERT') AS message_write,
      has_table_privilege(current_user,'messages','UPDATE') AS message_update,
      (SELECT relrowsecurity FROM pg_class WHERE oid='messages'::regclass) AS message_rls,
      (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
      (SELECT relowner=current_user::regrole FROM pg_class WHERE oid='messages'::regclass) AS message_owner,
      (SELECT count(*)::integer FROM pg_policy WHERE polrelid='messages'::regclass AND polname IN ('messages_runtime_read','messages_reviewed_question_insert','messages_reviewed_answer_insert')) AS message_policies,
      (has_table_privilege(current_user,'input_safety_reviews','SELECT') AND has_table_privilege(current_user,'input_safety_reviews','INSERT')) AS review_write,
      has_table_privilege(current_user,'input_safety_reviews','UPDATE') AS review_mutation,
      (has_table_privilege(current_user,'run_sources','SELECT') AND has_table_privilege(current_user,'run_sources','INSERT') AND has_table_privilege(current_user,'source_passages','SELECT') AND has_table_privilege(current_user,'source_passages','INSERT')) AS evidence_write,
      (has_table_privilege(current_user,'run_sources','UPDATE') OR has_table_privilege(current_user,'source_passages','UPDATE') OR has_table_privilege(current_user,'run_sources','DELETE')) AS evidence_mutation,
      (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('run_sources'::regclass,'source_passages'::regclass)) AS evidence_rls,
      (SELECT count(*)::integer FROM pg_policy WHERE polrelid IN ('run_sources'::regclass,'source_passages'::regclass)) AS evidence_policies,
      has_column_privilege(current_user,'run_retrievals','expires_at','UPDATE') AS evidence_expiry_write,
      (has_table_privilege(current_user,'output_safety_reviews','SELECT') AND has_table_privilege(current_user,'output_safety_reviews','INSERT') AND has_table_privilege(current_user,'run_settlements','INSERT') AND has_table_privilege(current_user,'message_citations','INSERT')) AS completion_write,
      (has_table_privilege(current_user,'output_safety_reviews','UPDATE') OR has_table_privilege(current_user,'run_settlements','UPDATE') OR has_table_privilege(current_user,'run_settlements','DELETE') OR has_table_privilege(current_user,'message_citations','UPDATE') OR has_table_privilege(current_user,'message_citations','DELETE')) AS completion_mutation,
      (has_column_privilege(current_user,'provider_calls','cap_micro_usd','UPDATE') OR has_column_privilege(current_user,'runs','accounting_version','UPDATE')) AS accounting_snapshot_write,
      has_column_privilege(current_user,'provider_calls','cost_micro_usd','UPDATE') AS provider_outcome_write,
      has_table_privilege(current_user,'provider_calls','DELETE') AS provider_delete,
      has_schema_privilege(current_user,'public','CREATE') AS schema_create,
      has_table_privilege(current_user,'usage_buckets','INSERT') AS budget_create,
      has_table_privilege(current_user,'operator_usage_buckets','INSERT') AS operator_budget_create,
      has_column_privilege(current_user,'usage_buckets','provider_limit_micro_usd','UPDATE') AS provider_limit_write,
      has_column_privilege(current_user,'usage_buckets','credit_limit','UPDATE') AS budget_limit_write,
      has_column_privilege(current_user,'usage_buckets','reserved_credits','UPDATE') AS reserve_credits,
      has_column_privilege(current_user,'operator_usage_buckets','reserved_provider_micro_usd','UPDATE') AS reserve_operator,
      has_column_privilege(current_user,'operator_usage_buckets','provider_limit_micro_usd','UPDATE') AS operator_limit_write,
      has_column_privilege(current_user,'runs','payload_hmac','UPDATE') AS fingerprint_write,
      has_column_privilege(current_user,'usage_buckets','settled_credits','UPDATE') AS settlement_write,
      has_table_privilege(current_user,'usage_reservations','UPDATE') AS reservation_write,
      (has_table_privilege(current_user,'source_passages','DELETE') AND has_table_privilege(current_user,'messages','DELETE') AND has_table_privilege(current_user,'input_safety_reviews','DELETE') AND has_table_privilege(current_user,'output_safety_reviews','DELETE') AND has_table_privilege(current_user,'run_plans','DELETE') AND has_table_privilege(current_user,'run_retrievals','DELETE')) AS lifecycle_cleanup,
      (SELECT count(*)::integer FROM pg_policy WHERE polcmd='d' AND ((polrelid='messages'::regclass AND polname='messages_deleted_conversation_delete') OR (polrelid='source_passages'::regclass AND polname='passages_expired_delete'))) AS cleanup_policies`;

// Match migrated runtime grants: lifecycle DELETE is required; UPDATE/elevation
// stays forbidden. Missing flags fail closed, rather than looking like false.
export function assertRuntimePermissions(rights:Record<string,unknown>) {
 const required=['reconciliation_access','completion_write','provider_outcome_write','evidence_write','evidence_rls','conversations','history','message_write','message_rls','review_write','settlement_write','reserve_credits','reserve_operator','request_rate_access','plan_access','feedback_access','feedback_rls','lifecycle_cleanup'];
 const forbidden=['reconciliation_elevation','completion_mutation','accounting_snapshot_write','provider_delete','evidence_mutation','evidence_expiry_write','message_update','bypass_rls','message_owner','review_mutation','schema_create','budget_create','operator_budget_create','budget_limit_write','provider_limit_write','operator_limit_write','fingerprint_write','reservation_write','request_rate_elevation','deadline_write','provider_cap_write','plan_mutation','feedback_elevation'];
 if(required.some(key=>rights[key]!==true)||forbidden.some(key=>rights[key]!==false)||rights.evidence_policies!==5||rights.message_policies!==3||rights.cleanup_policies!==2)throw new Error('Runtime privilege check failed');
}
