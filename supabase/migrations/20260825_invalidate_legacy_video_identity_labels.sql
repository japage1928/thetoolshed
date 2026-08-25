-- Production follow-up for databases that received the project identity
-- binding migration before legacy labels were explicitly cleared.
update public.video_studio_projects
set product_identity_status = 'pending',
    product_identity_confidence = 0,
    product_identity_source = 'unverified'
where product_identity_project_id is null
   or product_identity_source_fingerprint is null
   or product_identity_fingerprint is null
   or product_identity_verified_at is null
   or product_identity_verified_reference_revision is distinct from reference_revision;
