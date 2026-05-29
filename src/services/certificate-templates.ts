// ---------------------------------------------------------------------------
// EliteClass — Pre-built Certificate Templates
//
// These are starter templates matching the Elite Forums document formats.
// Admins can use these directly or customize them.
// ---------------------------------------------------------------------------

export interface PrebuiltTemplate {
  id: string;
  name: string;
  title: string;
  body_text: string;
  signatory_name: string;
  signatory_designation: string;
}

export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    id: "internship-completion",
    name: "Internship Completion Letter",
    title: "Internship Completion Letter",
    body_text: `Dear {{student_name}},

This is to certify that {{student_name}} has successfully completed their internship at Elite Forums as a {{role}} from {{start_date}} to {{end_date}}.

During the internship period, they actively contributed to various projects involving front-end and back-end development. They demonstrated strong technical understanding, problem-solving abilities, and a proactive approach while completing the tasks assigned to them. Their adaptability and willingness to learn new technologies were commendable.

{{student_name}} consistently met expectations and displayed dedication, professionalism, and commitment throughout the internship program. Their contributions were valuable to the team and reflected a positive work ethic.

We appreciate their efforts and enthusiasm and wish them great success in all their future endeavours.`,
    signatory_name: "Suchita Nigam",
    signatory_designation: "Project Manager",
  },
  {
    id: "offer-letter",
    name: "Offer Letter",
    title: "Offer Letter for {{role}}",
    body_text: `Dear {{student_name}},

We are pleased to offer you the position of {{role}} at Elite Forums. After evaluating your expertise, leadership qualities and strategic vision, we are confident that you will make a significant contribution to the continued growth and success of our organization.

Internship Details:
Position: {{role}}
Duration: {{start_date}} to {{end_date}}
Reporting To: Harsh Tambade (7249858976)

Key Responsibilities:
• Integrating AI APIs into full stack applications
• Designing intelligent, user-focused AI-driven features
• Debugging and maintaining AI-powered workflows
• Writing clean, scalable, and maintainable code

Terms:
• Maintain code quality, security, and data confidentiality
• Performance evaluated on delivery, code, and problem-solving
• Forward deployment responsibilities may apply based on needs

We look forward to your contributions. Kindly confirm your acceptance of this offer.`,
    signatory_name: "Harsh Tambade",
    signatory_designation: "Founder and CEO",
  },
  {
    id: "course-completion",
    name: "Course Completion Certificate",
    title: "Certificate of Completion",
    body_text: `Dear {{student_name}},

This is to certify that {{student_name}} has successfully completed the course "{{course_name}}" conducted by Elite Forums from {{start_date}} to {{end_date}}.

During the course, they demonstrated excellent understanding of the subject matter, active participation in all sessions, and consistent performance in assessments and assignments.

We commend their dedication to learning and wish them continued success in their academic and professional journey.

This certificate is issued as a recognition of their achievement and commitment to skill development.`,
    signatory_name: "Harsh Tambade",
    signatory_designation: "Founder and CEO",
  },
  {
    id: "appreciation-letter",
    name: "Letter of Appreciation",
    title: "Letter of Appreciation",
    body_text: `Dear {{student_name}},

We would like to express our sincere appreciation for your outstanding contribution during your time at Elite Forums as a {{role}}.

Your dedication, hard work, and positive attitude have made a significant impact on our team and projects. You have consistently gone above and beyond expectations, demonstrating exceptional skills and a strong work ethic.

Your contributions to {{batch_name}} have been invaluable, and we are grateful for your commitment to excellence.

We wish you all the best in your future endeavors and hope to collaborate again in the future.`,
    signatory_name: "Harsh Tambade",
    signatory_designation: "Founder and CEO",
  },
  {
    id: "experience-letter",
    name: "Experience Letter",
    title: "Experience Letter",
    body_text: `To Whom It May Concern,

This is to certify that {{student_name}} was associated with Elite Forums as a {{role}} from {{start_date}} to {{end_date}}.

During their tenure, they were responsible for:
• Contributing to web development projects
• Collaborating with team members on technical solutions
• Meeting project deadlines and quality standards
• Maintaining professional conduct and work ethics

Their performance was satisfactory and they demonstrated good technical skills, teamwork, and professionalism throughout their association with us.

We wish them all the best in their future career.

This letter is issued upon request for reference purposes.`,
    signatory_name: "Harsh Tambade",
    signatory_designation: "Founder and CEO",
  },
];
