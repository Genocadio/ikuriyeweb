import { AuthProvider } from '@/lib/auth'
import { WorkspaceProvider } from '@/lib/store'
import { WorkerShell } from '@/components/worker-shell'
import { PackageWorkspace } from '@/components/package-workspace'

export default function Page() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <WorkerShell>
          <PackageWorkspace />
        </WorkerShell>
      </WorkspaceProvider>
    </AuthProvider>
  )
}
