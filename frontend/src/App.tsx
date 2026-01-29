import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import CalendarPage from "./pages/CalendarPage";
import CalendarLoadingDemo from "./pages/CalendarLoadingDemo";
import TrainingPage from "./pages/TrainingPage";
import StudentsPage from "./pages/StudentsPage";
import MessagesPage from "./pages/MessagesPage";
import MessagesLoadingDemo from "./pages/MessagesLoadingDemo";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/calendar/loading" element={<CalendarLoadingDemo />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/loading" element={<MessagesLoadingDemo />} />
          <Route path="/settings" element={<DashboardPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
