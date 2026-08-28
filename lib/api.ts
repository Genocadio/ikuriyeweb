import { gql } from './client'
import type {
  DeliveryCodeResult,
  DeliveryPackage,
  DeliveryPackagePage,
  Notice,
  PackageCreation,
  PackageItem,
  PackageStatus,
  SortOrder,
  Transfer,
  TransferAcceptResult,
  TransferRuleType,
  User,
} from './types'
import { weightLabel } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// Shared fragments
// ─────────────────────────────────────────────────────────────────────────────

const TRANSFER_FIELDS = `
  id creatorId ruleType acceptorType matchCompanyId matchUserId requestorId status transferCode
  packages { id transferId packageId addedBy addedAt }
  createdAt updatedAt
`

const PACKAGE_FIELDS = `
  id trackingCode deliveryType status creatorId companyId tripId
  custodians { id userId name phone role assignedAt }
  people { id role userId name phone }
  locations { id type latitude longitude placeName placeId officeLocationId }
  details {
    category description fragile weight length width height declaredValue
    media { id url mimeType }
  }
  events { id eventType actorId description createdAt }
  custody { id fromEntity toEntity timestamp notes }
  transfers { ${TRANSFER_FIELDS} }
  createdAt updatedAt
`

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export interface MyProfileData {
  myProfile: User
}

export function fetchProfile(token: string): Promise<MyProfileData> {
  return gql<MyProfileData>(
    {
      query: `query MyProfile { myProfile { id email phone firstName lastName username role status createdAt updatedAt } }`,
      token,
    },
  )
}

export function syncCurrentUser(token: string): Promise<{ syncUser: User }> {
  return gql<{ syncUser: User }>(
    {
      query: `mutation SyncUser { syncUser { id email phone firstName lastName username role status } }`,
      token,
    },
  )
}

export interface PackagesData {
  myPackages: DeliveryPackagePage
}

export function fetchMyPackages(token: string, opts?: { status?: PackageStatus; order?: SortOrder; page?: number; size?: number }): Promise<PackagesData> {
  return gql<PackagesData>(
    {
      query: `query MyPackages($status: PackageStatus, $order: SortOrder, $page: Int, $size: Int) {
        myPackages(status: $status, order: $order, page: $page, size: $size) {
          items { ${PACKAGE_FIELDS} }
          totalCount totalPages currentPage
        }
      }`,
      variables: {
        status: opts?.status ?? null,
        order: opts?.order ?? 'DESC',
        page: opts?.page ?? 0,
        size: opts?.size ?? 200,
      },
      token,
    },
  )
}

export function fetchAvailablePackages(token: string, size = 100): Promise<{ availablePackages: DeliveryPackagePage }> {
  return gql<{ availablePackages: DeliveryPackagePage }>(
    {
      query: `query AvailablePackages($size: Int) {
        availablePackages(page: 0, size: $size) {
          items { ${PACKAGE_FIELDS} }
          totalCount totalPages currentPage
        }
      }`,
      variables: { size },
      token,
    },
  )
}

export function fetchMyTransfers(token: string): Promise<{ myTransfers: Transfer[] }> {
  return gql<{ myTransfers: Transfer[] }>(
    {
      query: `query MyTransfers { myTransfers { ${TRANSFER_FIELDS} } }`,
      token,
    },
  )
}

export function fetchTransfersByStatus(token: string, status: Transfer['status']): Promise<{ transfersByStatus: Transfer[] }> {
  return gql<{ transfersByStatus: Transfer[] }>(
    {
      query: `query TransfersByStatus($status: TransferStatus!) { transfersByStatus(status: $status) { ${TRANSFER_FIELDS} } }`,
      variables: { status },
      token,
    },
  )
}

export function fetchMyNotices(token: string): Promise<{ myNotices: Notice[] }> {
  return gql<{ myNotices: Notice[] }>(
    {
      query: `query MyNotices {
        myNotices {
          id resourceType resourceId eventType actorId title message payload
          viewer { id noticeId userId deliveredAt readAt }
          createdAt
        }
      }`,
      token,
    },
  )
}

export function fetchUnreadCount(token: string): Promise<{ unreadNoticeCount: number }> {
  return gql<{ unreadNoticeCount: number }>(
    {
      query: `query UnreadNoticeCount { unreadNoticeCount }`,
      token,
    },
  )
}

export function fetchDrivers(token: string, query = ''): Promise<{ searchUsers: User[] }> {
  return gql<{ searchUsers: User[] }>(
    {
      query: `query SearchDrivers($query: String) {
        searchUsers(query: $query, role: DRIVER) { id firstName lastName email phone username role status }
      }`,
      variables: { query },
      token,
    },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export function acceptTransfer(token: string, transferId: string, transferCode?: string): Promise<{ acceptTransfer: TransferAcceptResult }> {
  return gql<{ acceptTransfer: TransferAcceptResult }>(
    {
      query: `mutation AcceptTransfer($input: AcceptTransferInput!) {
        acceptTransfer(input: $input) {
          transfer { id ruleType acceptorType status requestorId }
          acceptedPackages { deliveryPackage { id trackingCode status } }
        }
      }`,
      variables: { input: { transferId, transferCode: transferCode ?? null } },
      token,
    },
  )
}

export interface CreatePackageInput {
  deliveryType: 'OPEN' | 'FIXED_ROUTE'
  sender?: { role: 'SENDER'; userId?: string | null; name?: string | null; phone?: string | null }
  receiver: { role: 'RECEIVER'; userId?: string | null; name?: string | null; phone?: string | null }
  origin: { type: 'ORIGIN'; latitude: number; longitude: number; placeName?: string | null; placeId?: string | null }
  destination: { type: 'DESTINATION'; latitude: number; longitude: number; placeName?: string | null; placeId?: string | null }
  details?: {
    category?: string | null
    description?: string | null
    fragile?: boolean | null
    weight?: number | null
    declaredValue?: number | null
  } | null
  transferRuleType?: TransferRuleType | null
  transferMatchCompanyId?: string | null
  transferMatchUserId?: string | null
}

export function createPackage(token: string, input: CreatePackageInput): Promise<{ createPackage: PackageCreation }> {
  return gql<{ createPackage: PackageCreation }>(
    {
      query: `mutation CreatePackage($input: CreatePackageInput!) {
        createPackage(input: $input) {
          deliveryPackage { ${PACKAGE_FIELDS} }
          transfer { ${TRANSFER_FIELDS} }
        }
      }`,
      variables: { input },
      token,
    },
  )
}

export function createTransfer(token: string, packageIds: string[], ruleType: TransferRuleType): Promise<{ createTransfer: Transfer }> {
  return gql<{ createTransfer: Transfer }>(
    {
      query: `mutation CreateTransfer($input: CreateTransferInput!) {
        createTransfer(input: $input) { ${TRANSFER_FIELDS} }
      }`,
      variables: { input: { packageIds, ruleType } },
      token,
    },
  )
}

export function addPackagesToTransfer(token: string, transferId: string, packageIds: string[]): Promise<{ addPackagesToTransfer: Transfer }> {
  return gql<{ addPackagesToTransfer: Transfer }>(
    {
      query: `mutation AddPackagesToTransfer($input: AddPackagesToTransferInput!) {
        addPackagesToTransfer(input: $input) { ${TRANSFER_FIELDS} }
      }`,
      variables: { input: { transferId, packageIds } },
      token,
    },
  )
}

export function assignDriver(token: string, packageId: string, driverId: string, notes?: string): Promise<{ assignDriver: DeliveryPackage }> {
  return gql<{ assignDriver: DeliveryPackage }>(
    {
      query: `mutation AssignDriver($input: AssignDriverInput!) {
        assignDriver(input: $input) { id trackingCode status }
      }`,
      variables: { input: { packageId, driverId, notes: notes ?? null } },
      token,
    },
  )
}

export function updatePackageStatus(token: string, packageId: string, status: PackageStatus, notes?: string): Promise<{ updatePackageStatus: DeliveryPackage }> {
  return gql<{ updatePackageStatus: DeliveryPackage }>(
    {
      query: `mutation UpdatePackageStatus($input: UpdatePackageStatusInput!) {
        updatePackageStatus(input: $input) { id trackingCode status }
      }`,
      variables: { input: { packageId, status, notes: notes ?? null } },
      token,
    },
  )
}

export function initiateDelivery(token: string, packageId: string): Promise<{ initiateDelivery: DeliveryCodeResult }> {
  return gql<{ initiateDelivery: DeliveryCodeResult }>(
    {
      query: `mutation InitiateDelivery($input: InitiateDeliveryInput!) {
        initiateDelivery(input: $input) { deliveryPackage { id status } deliveryCode }
      }`,
      variables: { input: { packageId } },
      token,
    },
  )
}

export function confirmDelivery(token: string, packageId: string, deliveryCode: string): Promise<{ confirmDelivery: DeliveryPackage }> {
  return gql<{ confirmDelivery: DeliveryPackage }>(
    {
      query: `mutation ConfirmDelivery($input: ConfirmDeliveryInput!) {
        confirmDelivery(input: $input) { id trackingCode status }
      }`,
      variables: { input: { packageId, deliveryCode } },
      token,
    },
  )
}

export function regenerateDeliveryCode(token: string, packageId: string): Promise<{ regenerateDeliveryCode: DeliveryCodeResult }> {
  return gql<{ regenerateDeliveryCode: DeliveryCodeResult }>(
    {
      query: `mutation RegenerateDeliveryCode($input: RegenerateDeliveryCodeInput!) {
        regenerateDeliveryCode(input: $input) { deliveryPackage { id status } deliveryCode }
      }`,
      variables: { input: { packageId } },
      token,
    },
  )
}

export function regenerateTransferCode(token: string, transferId: string): Promise<{ regenerateTransferCode: Transfer }> {
  return gql<{ regenerateTransferCode: Transfer }>(
    {
      query: `mutation RegenerateTransferCode($input: RegenerateTransferCodeInput!) {
        regenerateTransferCode(input: $input) { ${TRANSFER_FIELDS} }
      }`,
      variables: { input: { transferId } },
      token,
    },
  )
}

export function cancelTransfer(token: string, transferId: string): Promise<{ cancelTransfer: Transfer }> {
  return gql<{ cancelTransfer: Transfer }>(
    {
      query: `mutation CancelTransfer($transferId: ID!) { cancelTransfer(transferId: $transferId) { id status } }`,
      variables: { transferId },
      token,
    },
  )
}

export function confirmTransfer(token: string, transferId: string): Promise<{ confirmTransfer: Transfer }> {
  return gql<{ confirmTransfer: Transfer }>(
    {
      query: `mutation ConfirmTransfer($transferId: ID!) { confirmTransfer(transferId: $transferId) { id status } }`,
      variables: { transferId },
      token,
    },
  )
}

export function rejectTransfer(token: string, transferId: string): Promise<{ rejectTransfer: Transfer }> {
  return gql<{ rejectTransfer: Transfer }>(
    {
      query: `mutation RejectTransfer($transferId: ID!) { rejectTransfer(transferId: $transferId) { id status } }`,
      variables: { transferId },
      token,
    },
  )
}

export function markNoticeRead(token: string, viewerId: string): Promise<{ markNoticeRead: { id: string } }> {
  return gql<{ markNoticeRead: { id: string } }>(
    {
      query: `mutation MarkNoticeRead($viewerId: ID!) { markNoticeRead(viewerId: $viewerId) { id } }`,
      variables: { viewerId },
      token,
    },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping: backend DeliveryPackage → frontend PackageItem
// ─────────────────────────────────────────────────────────────────────────────

export function toPackageItem(pkg: DeliveryPackage, meId: string): PackageItem {
  const sender = pkg.people.find((p) => p.role === 'SENDER')
  const receiver = pkg.people.find((p) => p.role === 'RECEIVER')
  const origin = pkg.locations.find((l) => l.type === 'ORIGIN')
  const destination = pkg.locations.find((l) => l.type === 'DESTINATION')

  const custodians = [...pkg.custodians].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
  const current = custodians[0] ?? null
  const driver = custodians.find((c) => c.role === 'DRIVER')

  const openTransfer = pkg.transfers.find((t) => t.status === 'PENDING' || t.status === 'REQUESTED') ?? null
  const media = pkg.details?.media ?? []
  const photos = media.filter((m) => m.mimeType.startsWith('image/')).map((m) => m.url)

  return {
    id: pkg.id,
    trackingCode: pkg.trackingCode,
    deliveryType: pkg.deliveryType,
    status: pkg.status,
    sender: sender?.name ?? 'Sender',
    receiver: receiver?.name ?? 'Receiver',
    origin: origin?.placeName ?? 'Origin',
    destination: destination?.placeName ?? 'Destination',
    weight: weightLabel(pkg.details?.weight ?? null),
    category: pkg.details?.category ?? null,
    description: pkg.details?.description ?? null,
    fragile: pkg.details?.fragile ?? false,
    photos,
    currentCustodian: current
      ? { userId: current.userId, name: current.name ?? 'Custodian', role: current.role }
      : null,
    assignedDriver: driver?.name ?? null,
    isMine: current?.userId === meId,
    isCreator: pkg.creatorId === meId,
    openTransfer,
    events: pkg.events,
    custody: pkg.custody,
    updatedAt: pkg.updatedAt,
  }
}
