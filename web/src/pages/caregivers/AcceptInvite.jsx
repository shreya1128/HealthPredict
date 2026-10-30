import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, getErrorMessage } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../context/ProfileContext'

export default function AcceptCaregiver() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const { refreshProfiles } = useProfile()

  const [inviteInfo, setInviteInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token in the link.')
      setLoading(false)
      return
    }
    api.get(`/care-profiles/caregivers/invite-info?token=${encodeURIComponent(token)}`)
      .then((res) => setInviteInfo(res.data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [token])

  const handleAccept = async () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/care-profiles/caregivers/accept', { token })
      setSuccess(true)
      await refreshProfiles()
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <p className="text-slate-600">Verifying invitation...</p>
        </div>
      </div>
    )
  }

  if (error && !inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            !
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Invitation Error</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full">
        {success ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
              ✓
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Invitation Accepted!</h1>
            <p className="text-slate-600 mb-4">
              You are now connected as a caregiver for {inviteInfo?.owner_name}. Redirecting to dashboard...
            </p>
          </div>
        ) : (
          <div>
            <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
              🤝
            </div>
            <h1 className="text-xl font-bold text-center text-slate-800 mb-2">Caregiver Invitation</h1>
            <p className="text-slate-600 text-center mb-6 text-sm">
              <strong className="text-slate-800">{inviteInfo?.owner_name}</strong> invited you to access their health records on HealthPredict.
            </p>

            <div className="bg-slate-50 rounded-xl p-4 mb-6 text-sm space-y-2 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Access Level:</span>
                <span className="font-semibold text-slate-800">
                  {inviteInfo?.access_level === 'EDIT' ? 'Can Edit & Log' : 'View Only'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Invited Email:</span>
                <span className="font-semibold text-slate-800">{inviteInfo?.caregiver_email}</span>
              </div>
              {isAuthenticated && user?.email !== inviteInfo?.caregiver_email && (
                <div className="mt-3 p-2 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-200">
                  You are currently logged in as <strong>{user?.email}</strong>. Please switch accounts if this invitation was meant for {inviteInfo?.caregiver_email}.
                </div>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-200">
                {error}
              </div>
            )}

            <button
              onClick={handleAccept}
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-xl transition"
            >
              {submitting ? 'Accepting...' : isAuthenticated ? 'Accept Invitation' : 'Log In to Accept'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
