export interface User {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  accountStatus: string;
  showcase?: boolean;
}
export interface Vehicle {
  id: string;
  registrationNumber: string;
  vehicleType: 'CAR' | 'TWO_WHEELER';
  vehicleModel: string;
}
export interface Slot {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
}
export interface Block {
  id: string;
  startTime: string;
  endTime: string;
  reason: string;
}
export interface Review {
  id: string;
  rating: number;
  comment: string;
  reviewer?: { fullName: string };
}
export interface Spot {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  hourlyPrice: number;
  vehicleTypes: string[];
  parkingType: string;
  spotNumber: string;
  accessInstructions: string;
  images: string[];
  approvalStatus: string;
  isActive: boolean;
  permissionConfirmed: boolean;
  availability: Slot[];
  blocks: Block[];
  reviews: Review[];
  rating?: number;
  reviewCount?: number;
  distance?: number;
  physicallyOccupied?: boolean;
  available?: boolean;
  owner?: { fullName: string };
}
export interface Payment {
  id: string;
  bookingId: string;
  paymentType: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  transactionReference: string;
  createdAt: string;
  booking?: { spot: { title: string } };
}
export interface Dispute {
  status: string;
  message: string;
  openedAt: string;
  resolution?: string;
  responses: { actor: string; at: string; detail: string }[];
}
export interface Booking {
  createdAt: string;
  id: string;
  driverId: string;
  parkingSpotId: string;
  startTime: string;
  endTime: string;
  bookingStatus: string;
  paymentStatus: string;
  totalAmount: number;
  priceSnapshot: number;
  holdExpiresAt: string | null;
  occupied: boolean;
  fineAmount: number;
  fineStatus: string;
  overstayMinutes: number;
  provisionalFine: number;
  spaceUnavailable: boolean;
  serverTime: string;
  checkoutReminder: boolean;
  checkedInAt: string | null;
  actualExitTime: string | null;
  checkoutRequestedAt: string | null;
  fineCapAt: string | null;
  cancellationReason: string | null;
  dispute: Dispute | null;
  spot: Spot;
  vehicle: Vehicle;
  payments: Payment[];
  review: Review | null;
  driver?: { fullName: string };
  termsSnapshot: {
    graceMinutes: number;
    intervalMinutes: number;
    intervalPaise: number;
    title: string;
    address: string;
    accessInstructions: string;
    timezone: string;
    cancellation: string;
  };
  audit: { actor: string; action: string; at: string; detail: unknown }[];
}
export interface AppConfig {
  demo: boolean;
  serverTime: string;
  areas: string[];
  policy: {
    holdMinutes: number;
    graceMinutes: number;
    fineInterval: number;
    fineRupees: number;
    cancellation: string;
  };
}
export interface Notification {
  id: string;
  message: string;
  bookingId?: string;
  read: boolean;
  at: string;
}
export interface AdminData {
  users: User[];
  spots: Spot[];
  bookings: Booking[];
  payments: Payment[];
  stats: { users: number; spots: number; bookings: number; revenue: number; disputes: number };
}
