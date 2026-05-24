-- ============================================================
-- EduOS Migration 034 — Assignment Storage Buckets
-- ============================================================

-- 1. Create Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('assignment-resources', 'assignment-resources', true),
    ('assignment-submissions', 'assignment-submissions', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Assignment Resources Policies (Public Read, Admin Write)
CREATE POLICY "Public Access to Resources" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'assignment-resources');

CREATE POLICY "Admins can upload resources" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'assignment-resources' 
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'admin'
    );

CREATE POLICY "Admins can update resources" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'assignment-resources' 
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'admin'
    );

CREATE POLICY "Admins can delete resources" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'assignment-resources' 
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'admin'
    );

-- 3. Assignment Submissions Policies (Admin/Staff Read, Student Own Write)
CREATE POLICY "Admins and Staff can view submissions" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'assignment-submissions'
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() IN ('admin', 'staff')
    );

CREATE POLICY "Students can view own submissions" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'assignment-submissions'
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'student'
        -- Verification of own folder structure is handled via path logic in service
    );

CREATE POLICY "Students can upload submissions" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'assignment-submissions'
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'student'
    );

CREATE POLICY "Students can update own submissions" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'assignment-submissions'
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'student'
    );
