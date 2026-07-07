import { createBrowserRouter } from 'react-router'
import { DashboardPage } from '@/pages/DashboardPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { InterviewPage } from '@/pages/InterviewPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PracticePage } from '@/pages/PracticePage'
import { RolesPage } from '@/pages/RolesPage'
import { AuthLayout, ProtectedLayout, ResumeProfileRoute, ResumeSetupRoute, RootRedirect } from './route-elements'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />,
  },
  {
    path: '/auth/login',
    element: <AuthLayout />,
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        path: '/dashboard',
        element: <DashboardPage />,
      },
      {
        path: '/resume/profile',
        element: <ResumeProfileRoute />,
      },
      {
        path: '/resume/setup',
        element: <ResumeSetupRoute />,
      },
      {
        path: '/roles',
        element: <RolesPage />,
      },
      {
        path: '/practice',
        element: <PracticePage />,
      },
      {
        path: '/interview',
        element: <InterviewPage />,
      },
      {
        path: '/history',
        element: <HistoryPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
