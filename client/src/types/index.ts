export interface User {
  id: string
  name: string
  email: string
}

export interface Document {
  id: string
  originalName: string
  fileUrl: string
  status: 'PENDING' | 'SIGNED' | 'EXPIRED'
  pages: number
  size: number
  createdAt: string
  ownerId: string
}

export interface AuthResponse {
  accessToken: string
  user: User
}
export interface Signature {
  id: string
  documentId: string
  userId: string
  x: number
  y: number
  page: number
  width: number
  height: number
  status: 'PLACED' | 'SIGNED'
  createdAt: string
}