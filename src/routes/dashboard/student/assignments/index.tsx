import { createFileRoute } from '@tanstack/react-router'
import { StudentAssignmentDashboard } from '@/modules/assignments/components/student/StudentAssignmentDashboard'
import { ProtectedRoute } from '@/components/ProtectedRoute'

export const Route = createFileRoute('/dashboard/student/assignments/')({
  component: StudentAssignmentsPage,
})

function StudentAssignmentsPage() {
  return (
    <ProtectedRoute allowedRoles={['student']}>
      <StudentAssignmentDashboard />
    </ProtectedRoute>
  )
}
