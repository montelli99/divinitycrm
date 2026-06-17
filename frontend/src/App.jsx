import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react';
import Dashboard from './pages/Dashboard';
import LeadDetail from './pages/LeadDetail';
import Pipeline from './pages/Pipeline';
import Contracts from './pages/Contracts';
import Layout from './components/Layout';

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
          <Route path="/sign-in" element={<SignIn routing="path" path="/sign-in" />} />
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

