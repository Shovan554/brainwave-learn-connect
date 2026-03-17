import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FloatingAICopilot } from "@/components/FloatingAICopilot";
import Login from "./pages/Login";
import Register from "./pages/Register";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import CreateCourse from "./pages/teacher/CreateCourse";
import CourseDetail from "./pages/teacher/CourseDetail";
import GradeAssignment from "./pages/teacher/GradeAssignment";
import StudentDashboard from "./pages/student/StudentDashboard";
import StudentCourseDetail from "./pages/student/StudentCourseDetail";
import StudentAssignment from "./pages/student/StudentAssignment";
import MyReadings from "./pages/student/MyReadings";
import StudentProfile from "./pages/student/StudentProfile";
import StudentGrades from "./pages/student/StudentGrades";
import PublicProfile from "./pages/student/PublicProfile";
import Messages from "./pages/Messages";
import Reels from "./pages/Reels";
import Explore from "./pages/Explore";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function RootRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={role === "teacher" ? "/teacher/dashboard" : "/student/dashboard"} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Teacher routes */}
            <Route path="/teacher/dashboard" element={<ProtectedRoute requiredRole="teacher"><TeacherDashboard /></ProtectedRoute>} />
            <Route path="/teacher/courses/new" element={<ProtectedRoute requiredRole="teacher"><CreateCourse /></ProtectedRoute>} />
            <Route path="/teacher/courses/:id" element={<ProtectedRoute requiredRole="teacher"><CourseDetail /></ProtectedRoute>} />
            <Route path="/teacher/courses/:courseId/assignments/:assignmentId/grade" element={<ProtectedRoute requiredRole="teacher"><GradeAssignment /></ProtectedRoute>} />

            {/* Student routes */}
            <Route path="/student/dashboard" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
            <Route path="/student/courses/:id" element={<ProtectedRoute requiredRole="student"><StudentCourseDetail /></ProtectedRoute>} />
            <Route path="/student/courses/:courseId/assignments/:assignmentId" element={<ProtectedRoute requiredRole="student"><StudentAssignment /></ProtectedRoute>} />
            <Route path="/student/readings" element={<ProtectedRoute requiredRole="student"><MyReadings /></ProtectedRoute>} />
            <Route path="/student/grades" element={<ProtectedRoute requiredRole="student"><StudentGrades /></ProtectedRoute>} />
            <Route path="/student/profile" element={<ProtectedRoute><StudentProfile /></ProtectedRoute>} />
            <Route path="/students/:studentId/profile" element={<ProtectedRoute><PublicProfile /></ProtectedRoute>} />

            {/* Shared routes */}
            <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
            <Route path="/reels" element={<ProtectedRoute><Reels /></ProtectedRoute>} />
            <Route path="/explore" element={<ProtectedRoute><Explore /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          <FloatingAICopilot />
        </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
