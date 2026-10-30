import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { AuthProvider } from './context/AuthContext'
import { ProfileProvider } from './context/ProfileContext'
import ProtectedRoute from './components/common/ProtectedRoute'
import AuthLayout from './layouts/AuthLayout'
import AppLayout from './layouts/AppLayout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import VerifyEmail from './pages/auth/VerifyEmail'
import AcceptInvite from './pages/caregivers/AcceptInvite'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import NewAssessment from './pages/health/NewAssessment'
import AssessmentResult from './pages/health/AssessmentResult'
import History from './pages/health/History'
import HealthTimeline from './pages/health/HealthTimeline'
import DiabetesScreening from './pages/health/DiabetesScreening'
import MenstrualTracking from './pages/health/MenstrualTracking'
import FattyLiverScreening from './pages/health/FattyLiverScreening'
import Medicines from './pages/medicines/Medicines'
import MedicineDetail from './pages/medicines/MedicineDetail'
import Track from './pages/track/Track'
import Goals from './pages/goals/Goals'
import Reports from './pages/reports/Reports'
import Notifications from './pages/notifications/Notifications'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverview from './pages/admin/Overview'
import AdminUsers from './pages/admin/Users'
import AdminModel from './pages/admin/MlModel'
import AdminAudit from './pages/admin/AuditLog'
import Landing from './pages/Landing'
import Onboarding from './pages/onboarding/Onboarding'
import SymptomDiary from './pages/symptoms/SymptomDiary'
import Appointments from './pages/appointments/Appointments'
import EmergencyCard from './pages/emergency/EmergencyCard'
import PublicEmergencyCard from './pages/emergency/PublicEmergencyCard'
import PublicDoctorSummary from './pages/reports/PublicDoctorSummary'

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <ProfileProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/e/:token" element={<PublicEmergencyCard />} />
            <Route path="/s/:token" element={<PublicDoctorSummary />} />
            <Route path="/caregivers/accept" element={<AcceptInvite />} />
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/today" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/assessment" element={<NewAssessment />} />
              <Route path="/assessment/:id" element={<AssessmentResult />} />
              <Route path="/history" element={<History />} />
              <Route path="/timeline" element={<HealthTimeline />} />
              <Route path="/diabetes" element={<DiabetesScreening />} />
              <Route path="/health/diabetes" element={<DiabetesScreening />} />
              <Route path="/menstrual" element={<MenstrualTracking />} />
              <Route path="/health/menstrual" element={<MenstrualTracking />} />
              <Route path="/fatty-liver" element={<FattyLiverScreening />} />
              <Route path="/health/fatty-liver" element={<FattyLiverScreening />} />
              <Route path="/medicines" element={<Medicines />} />
              <Route path="/medicines/:id" element={<MedicineDetail />} />
              <Route path="/track" element={<Track />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/symptoms" element={<SymptomDiary />} />
              <Route path="/appointments" element={<Appointments />} />
              <Route path="/emergency-card" element={<EmergencyCard />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/notifications" element={<Notifications />} />
            </Route>
          </Route>
          {/* Admin area: the server enforces the role on every API call; this guard only avoids showing pages that would fail. */}
          <Route element={<ProtectedRoute role="ADMIN" />}>
            <Route element={<AppLayout />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOverview />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="model" element={<AdminModel />} />
                <Route path="audit" element={<AdminAudit />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer position="bottom-right" autoClose={5000} />
        </ProfileProvider>
      </AuthProvider>
    </Router>
  )
}
