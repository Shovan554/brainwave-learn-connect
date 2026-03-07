import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: any = { teachers: [], students: [], courses: [], enrollments: [] };

  // Create teachers
  const teachers = [
    { email: "prof.johnson@caldwell.edu", password: "Teacher123!", name: "Dr. Marcus Johnson" },
    { email: "prof.chen@caldwell.edu", password: "Teacher123!", name: "Dr. Lisa Chen" },
    { email: "prof.williams@caldwell.edu", password: "Teacher123!", name: "Dr. James Williams" },
  ];

  for (const t of teachers) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: t.email,
      password: t.password,
      email_confirm: true,
      user_metadata: { name: t.name, role: "teacher" },
    });
    if (error) {
      results.teachers.push({ email: t.email, error: error.message });
    } else {
      results.teachers.push({ email: t.email, id: data.user.id, password: t.password });
    }
  }

  // Create additional students
  const students = [
    { email: "jdoe@caldwell.edu", password: "Student123!", name: "John Doe" },
    { email: "asmith@caldwell.edu", password: "Student123!", name: "Alice Smith" },
    { email: "mgarcia@caldwell.edu", password: "Student123!", name: "Maria Garcia" },
  ];

  for (const s of students) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: s.email,
      password: s.password,
      email_confirm: true,
      user_metadata: { name: s.name, role: "student" },
    });
    if (error) {
      results.students.push({ email: s.email, error: error.message });
    } else {
      results.students.push({ email: s.email, id: data.user.id, password: s.password });
    }
  }

  // Wait a moment for triggers to fire
  await new Promise((r) => setTimeout(r, 1000));

  // Get teacher IDs from results
  const teacherIds = results.teachers.filter((t: any) => t.id).map((t: any) => t.id);

  // Create courses
  const courseData = [
    { title: "Introduction to Computer Science", term: "Spring 2026", description: "Fundamentals of programming and computational thinking", teacher_idx: 0 },
    { title: "Data Structures & Algorithms", term: "Spring 2026", description: "Advanced data structures, algorithm design, and complexity analysis", teacher_idx: 1 },
    { title: "Web Development", term: "Spring 2026", description: "Full-stack web development with modern frameworks", teacher_idx: 0 },
    { title: "Database Systems", term: "Spring 2026", description: "Relational databases, SQL, and NoSQL systems", teacher_idx: 2 },
    { title: "Artificial Intelligence", term: "Spring 2026", description: "Machine learning, neural networks, and AI fundamentals", teacher_idx: 1 },
  ];

  for (const c of courseData) {
    if (!teacherIds[c.teacher_idx]) continue;
    const { data, error } = await supabaseAdmin
      .from("courses")
      .insert({ title: c.title, term: c.term, description: c.description, teacher_id: teacherIds[c.teacher_idx] })
      .select()
      .single();
    if (error) {
      results.courses.push({ title: c.title, error: error.message });
    } else {
      results.courses.push({ title: c.title, id: data.id, invite_code: data.invite_code, teacher: teachers[c.teacher_idx].email });
    }
  }

  // Find sraut@caldwell.edu
  const { data: srautData } = await supabaseAdmin.auth.admin.listUsers();
  const sraut = srautData?.users?.find((u: any) => u.email === "sraut@caldwell.edu");

  // Collect all student IDs to enroll
  const studentIdsToEnroll: string[] = [];
  if (sraut) studentIdsToEnroll.push(sraut.id);
  for (const s of results.students) {
    if (s.id) studentIdsToEnroll.push(s.id);
  }

  // Enroll students in courses
  const courseIds = results.courses.filter((c: any) => c.id).map((c: any) => c.id);
  for (const courseId of courseIds) {
    for (const studentId of studentIdsToEnroll) {
      const { error } = await supabaseAdmin
        .from("enrollments")
        .insert({ course_id: courseId, student_id: studentId });
      if (!error) {
        results.enrollments.push({ course_id: courseId, student_id: studentId });
      }
    }
  }

  results.sraut_found = !!sraut;

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
