import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react';
import Dashboard from './pages/Dashboard';
import LeadDetail from './pages/LeadDetail';
import Pipeline from './pages/Pipeline';
import Contracts from './pages/Contracts';
import Layout from './components/Layout';

const clerkAppearance = {
  layout: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'iconButton',
    logoPlacement: 'none',
  },
  variables: {
    colorBackground: '#11141f',
    colorText: '#f0f2f8',
    colorTextSecondary: '#a8aec6',
    colorInputBackground: '#181c2a',
    colorInputText: '#f0f2f8',
    colorInputBorder: '#2a3050',
    colorPrimary: '#5b6cf0',
    colorDanger: '#ef4444',
    colorSuccess: '#22c55e',
    borderRadius: '10px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '15px',
  },
  elements: {
    card: {
      boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6)',
      border: '1px solid #1e2338',
    },
    headerTitle: {
      fontSize: '1.5rem',
      fontWeight: '700',
    },
    headerSubtitle: {
      fontSize: '0.9rem',
      color: '#a8aec6',
    },
    socialButtonsBlockButton: {
      border: '1px solid #2a3050',
      background: '#181c2a',
      color: '#f0f2f8',
      borderRadius: '10px',
    },
    socialButtonsBlockButtonText: {
      color: '#f0f2f8',
      fontWeight: '500',
    },
    socialButtonsBlockButtonArrow: {
      color: '#f0f2f8',
    },
    formButtonPrimary: {
      background: 'linear-gradient(135deg, #5b6cf0, #6d7af7)',
      borderRadius: '10px',
      fontWeight: '600',
      boxShadow: '0 2px 8px rgba(91, 108, 240, 0.3)',
    },
    formFieldInput: {
      borderRadius: '10px',
      border: '1px solid #2a3050',
      background: '#181c2a',
      color: '#f0f2f8',
    },
    formFieldLabel: {
      color: '#a8aec6',
      fontWeight: '500',
    },
    footerActionText: {
      color: '#a8aec6',
    },
    footerActionLink: {
      color: '#5b6cf0',
      fontWeight: '600',
    },
    dividerLine: {
      background: '#2a3050',
    },
    dividerText: {
      color: '#6b7194',
    },
    identityPreviewText: {
      color: '#f0f2f8',
    },
    identityPreviewEditButton: {
      color: '#5b6cf0',
    },
    formFieldAction: {
      color: '#5b6cf0',
    },
    alertText: {
      color: '#f0f2f8',
    },
    otpCodeFieldInput: {
      borderRadius: '10px',
      border: '1px solid #2a3050',
      background: '#181c2a',
      color: '#f0f2f8',
    },
  },
};

function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <div className="loading">Loading...</div>;
  if (!isSignedIn) return <Navigate to="/sign-in" />;
  return children;
}

export default function App() {
  return (
    <>
      <SignedOut>
        <Routes>
          <Route path="/sign-in" element={<SignIn routing="path" path="/sign-in" appearance={clerkAppearance} />} />
          <Route path="*" element={<Navigate to="/sign-in" />} />
        </Routes>
      </SignedOut>

      <SignedIn>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </SignedIn>
    </>
  );
}

