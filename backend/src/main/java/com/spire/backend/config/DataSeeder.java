package com.spire.backend.config;

import com.spire.backend.entity.*;
import com.spire.backend.entity.Module;
import com.spire.backend.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private CourseRepository courseRepository;

    @Autowired
    private LessonRepository lessonRepository;

    @Autowired
    private ModuleRepository moduleRepository;

    @Autowired
    private AchievementRepository achievementRepository;

    @Autowired
    private EnrollmentRepository enrollmentRepository;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Override
    @Transactional
    public void run(String... args) {
        // Seed roles first (idempotent)
        Role studentRole = roleRepository.findByName("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().name("STUDENT").build()));
        Role instructorRole = roleRepository.findByName("INSTRUCTOR")
                .orElseGet(() -> roleRepository.save(Role.builder().name("INSTRUCTOR").build()));
        Role adminRole = roleRepository.findByName("ADMIN")
                .orElseGet(() -> roleRepository.save(Role.builder().name("ADMIN").build()));
        Role trainerRole = roleRepository.findByName("TRAINER")
                .orElseGet(() -> roleRepository.save(Role.builder().name("TRAINER").build()));
        log.info("Roles ready: STUDENT({}), INSTRUCTOR({}), TRAINER({}), ADMIN({})",
                studentRole.getId(), instructorRole.getId(), trainerRole.getId(), adminRole.getId());

        if (userRepository.count() > 0) {
            log.info("Database already seeded. Skipping initial users/courses block.");
            // Backfill on already-seeded dev DBs that predate the services
            // feature. Idempotent — does nothing if the trainer + 4 services
            // already exist.
            seedServicesAndTrainer(trainerRole);
            return;
        }

        log.info("Seeding database...");

        // --- Users ---
        log.info("Seeding users...");

        User admin = userRepository.save(User.builder()
                .email("admin@spire.dev")
                .passwordHash(passwordEncoder.encode("admin123"))
                .fullName("Spire Admin")
                .role(adminRole)
                .build());

        User student = userRepository.save(User.builder()
                .email("student@spire.dev")
                .passwordHash(passwordEncoder.encode("student123"))
                .fullName("Abhishek Student")
                .role(studentRole)
                .bio("A passionate learner exploring new skills on Spire.")
                .build());

        User arjun = userRepository.save(User.builder()
                .email("arjun@spire.dev")
                .passwordHash(passwordEncoder.encode("password123"))
                .fullName("Arjun Mehta")
                .role(instructorRole)
                .bio("Senior full-stack engineer with 10+ years building scalable web applications. Ex-Flipkart, ex-Razorpay.")
                .build());

        User priya = userRepository.save(User.builder()
                .email("priya@spire.dev")
                .passwordHash(passwordEncoder.encode("password123"))
                .fullName("Priya Sharma")
                .role(instructorRole)
                .bio("Data scientist and ML engineer. Passionate about making complex topics accessible.")
                .build());

        User rahul = userRepository.save(User.builder()
                .email("rahul@spire.dev")
                .passwordHash(passwordEncoder.encode("password123"))
                .fullName("Rahul Kapoor")
                .role(instructorRole)
                .bio("Mobile and cloud architect. Google Developer Expert.")
                .build());

        log.info("Seeded 5 users.");

        // --- Courses ---
        log.info("Seeding courses...");

        Course fullStack = courseRepository.save(Course.builder()
                .title("Full-Stack Web Development")
                .slug("full-stack-web-development")
                .description("Master modern web development from front to back. Learn HTML, CSS, JavaScript, React, Node.js, databases, and deployment in one comprehensive course.")
                .shortDescription("Build complete web applications from scratch")
                .level(Course.Level.INTERMEDIATE)
                .price(BigDecimal.ZERO)
                .isFree(true)
                .durationHours(42.5)
                .instructor(arjun)
                .lessonsCount(5)
                .enrolledCount(12450)
                .rating(4.8)
                .ratingsCount(3241)
                .category("Web Development")
                .tags("html,css,javascript,react,nodejs,mongodb")
                .isPublished(true)
                .build());

        Course react = courseRepository.save(Course.builder()
                .title("React Mastery")
                .slug("react-mastery")
                .description("Take your React skills to the next level. Advanced patterns, performance optimization, state management, and real-world project architecture.")
                .shortDescription("Advanced React patterns and best practices")
                .level(Course.Level.ADVANCED)
                .price(new BigDecimal("499.00"))
                .isFree(false)
                .durationHours(28.0)
                .instructor(arjun)
                .lessonsCount(5)
                .enrolledCount(8320)
                .rating(4.9)
                .ratingsCount(2150)
                .category("Frontend")
                .tags("react,hooks,redux,nextjs,typescript")
                .isPublished(true)
                .build());

        Course python = courseRepository.save(Course.builder()
                .title("Python for Data Science")
                .slug("python-for-data-science")
                .description("Learn Python programming and data science from scratch. Covers NumPy, Pandas, Matplotlib, Scikit-learn, and real-world data analysis projects.")
                .shortDescription("Data analysis and ML with Python")
                .level(Course.Level.BEGINNER)
                .price(BigDecimal.ZERO)
                .isFree(true)
                .durationHours(35.0)
                .instructor(priya)
                .lessonsCount(5)
                .enrolledCount(15600)
                .rating(4.7)
                .ratingsCount(4520)
                .category("Data Science")
                .tags("python,numpy,pandas,matplotlib,scikit-learn,ml")
                .isPublished(true)
                .build());

        Course aws = courseRepository.save(Course.builder()
                .title("Cloud Architecture with AWS")
                .slug("cloud-architecture-with-aws")
                .description("Design and deploy scalable cloud solutions on AWS. Covers EC2, S3, Lambda, DynamoDB, CloudFormation, and architecture best practices.")
                .shortDescription("Build scalable cloud solutions on AWS")
                .level(Course.Level.ADVANCED)
                .price(new BigDecimal("499.00"))
                .isFree(false)
                .durationHours(32.0)
                .instructor(rahul)
                .lessonsCount(4)
                .enrolledCount(6780)
                .rating(4.6)
                .ratingsCount(1890)
                .category("Cloud")
                .tags("aws,ec2,s3,lambda,dynamodb,cloudformation")
                .isPublished(true)
                .build());

        Course uiux = courseRepository.save(Course.builder()
                .title("UI/UX Design Fundamentals")
                .slug("ui-ux-design-fundamentals")
                .description("Learn the principles of great user interface and user experience design. Covers Figma, design systems, wireframing, prototyping, and usability testing.")
                .shortDescription("Design beautiful and usable interfaces")
                .level(Course.Level.BEGINNER)
                .price(new BigDecimal("499.00"))
                .isFree(false)
                .durationHours(20.0)
                .instructor(priya)
                .lessonsCount(4)
                .enrolledCount(9200)
                .rating(4.8)
                .ratingsCount(2680)
                .category("Design")
                .tags("figma,ui,ux,wireframing,prototyping,design-systems")
                .isPublished(true)
                .build());

        Course mobile = courseRepository.save(Course.builder()
                .title("Mobile App Development with React Native")
                .slug("mobile-app-development-with-react-native")
                .description("Build cross-platform mobile apps with React Native. Covers navigation, state management, native modules, animations, and app store deployment.")
                .shortDescription("Cross-platform mobile apps with React Native")
                .level(Course.Level.INTERMEDIATE)
                .price(new BigDecimal("499.00"))
                .isFree(false)
                .durationHours(30.0)
                .instructor(rahul)
                .lessonsCount(5)
                .enrolledCount(7450)
                .rating(4.7)
                .ratingsCount(1960)
                .category("Mobile")
                .tags("react-native,mobile,ios,android,javascript")
                .isPublished(true)
                .build());

        log.info("Seeded 6 courses.");

        // --- Lessons ---
        log.info("Seeding lessons...");

        // Full-Stack Web Development
        seedLessons(fullStack, List.of(
                new String[]{"Introduction to Web Development", "Overview of the web stack and setting up your development environment", "45"},
                new String[]{"HTML & CSS Deep Dive", "Semantic HTML, CSS Grid, Flexbox, and responsive design", "90"},
                new String[]{"JavaScript Fundamentals", "Variables, functions, DOM manipulation, and async programming", "80"},
                new String[]{"Backend with Node.js & Express", "Building REST APIs, middleware, and database integration", "95"},
                new String[]{"Full-Stack Project: E-Commerce App", "Putting it all together with a capstone project", "120"}
        ));

        // React Mastery
        seedLessons(react, List.of(
                new String[]{"Advanced Component Patterns", "Compound components, render props, and higher-order components", "65"},
                new String[]{"React Performance Optimization", "Memoization, code splitting, and profiling", "70"},
                new String[]{"State Management Deep Dive", "Context API, Redux Toolkit, and Zustand", "75"},
                new String[]{"Server-Side Rendering with Next.js", "SSR, SSG, ISR, and API routes", "80"},
                new String[]{"Testing React Applications", "Unit testing, integration testing, and E2E with Cypress", "55"}
        ));

        // Python for Data Science
        seedLessons(python, List.of(
                new String[]{"Python Basics for Data Science", "Variables, data types, loops, and functions", "60"},
                new String[]{"Data Manipulation with Pandas", "DataFrames, filtering, grouping, and merging", "85"},
                new String[]{"Data Visualization with Matplotlib", "Charts, plots, and customizing visualizations", "70"},
                new String[]{"Introduction to Machine Learning", "Scikit-learn, classification, and regression", "90"},
                new String[]{"Capstone: Predictive Analytics Project", "End-to-end ML project with real-world data", "100"}
        ));

        // Cloud Architecture with AWS
        seedLessons(aws, List.of(
                new String[]{"AWS Fundamentals & IAM", "Account setup, IAM roles, and security best practices", "55"},
                new String[]{"Compute & Storage Services", "EC2, S3, EBS, and auto-scaling groups", "80"},
                new String[]{"Serverless Architecture with Lambda", "Lambda functions, API Gateway, and event-driven design", "75"},
                new String[]{"Infrastructure as Code", "CloudFormation, Terraform basics, and CI/CD pipelines", "90"}
        ));

        // UI/UX Design Fundamentals
        seedLessons(uiux, List.of(
                new String[]{"Design Thinking & UX Principles", "User-centered design process and research methods", "50"},
                new String[]{"Wireframing & Prototyping", "Low-fi to high-fi prototypes with Figma", "65"},
                new String[]{"Visual Design & Design Systems", "Typography, color theory, and component libraries", "70"},
                new String[]{"Usability Testing & Iteration", "Conducting user tests and iterating on feedback", "55"}
        ));

        // Mobile App Development with React Native
        seedLessons(mobile, List.of(
                new String[]{"React Native Setup & Core Components", "Environment setup, View, Text, Image, and styling", "60"},
                new String[]{"Navigation & Routing", "React Navigation, stack, tab, and drawer navigators", "70"},
                new String[]{"State Management & API Integration", "Redux, AsyncStorage, and REST API consumption", "75"},
                new String[]{"Animations & Native Modules", "Animated API, Reanimated, and bridging native code", "80"},
                new String[]{"App Store Deployment", "Building, signing, and publishing to iOS and Android stores", "65"}
        ));

        log.info("Seeded lessons for all courses.");

        // --- Modules (group lessons by topic) ---
        log.info("Seeding modules and assigning lessons to them...");

        seedModules(fullStack, List.of(
                new ModuleSpec("Frontend Foundations",
                        "Get comfortable with HTML, CSS, and JavaScript before moving to the back end.",
                        List.of(1, 2, 3)),
                new ModuleSpec("Backend Development",
                        "Build a REST API with Node.js and Express.",
                        List.of(4)),
                new ModuleSpec("Capstone Project",
                        "Bring everything together by building a full-stack e-commerce app.",
                        List.of(5))
        ));

        seedModules(react, List.of(
                new ModuleSpec("Components & Performance",
                        "Advanced component patterns and how to keep React fast.",
                        List.of(1, 2)),
                new ModuleSpec("State & Architecture",
                        "Pick the right state-management strategy and explore Next.js rendering modes.",
                        List.of(3, 4)),
                new ModuleSpec("Quality & Testing",
                        "Test your React applications across unit, integration, and E2E layers.",
                        List.of(5))
        ));

        seedModules(python, List.of(
                new ModuleSpec("Python & Data Foundations",
                        "Core Python plus the data-manipulation library you'll use every day.",
                        List.of(1, 2)),
                new ModuleSpec("Visualization & Insights",
                        "Communicate findings with charts using Matplotlib.",
                        List.of(3)),
                new ModuleSpec("Machine Learning",
                        "Move from your first scikit-learn model to an end-to-end capstone.",
                        List.of(4, 5))
        ));

        seedModules(aws, List.of(
                new ModuleSpec("AWS Foundations",
                        "Get oriented in the AWS console and lock down access with IAM.",
                        List.of(1)),
                new ModuleSpec("Core Services",
                        "Compute, storage, and serverless: the AWS workhorses.",
                        List.of(2, 3)),
                new ModuleSpec("Operations & IaC",
                        "Codify your infrastructure with CloudFormation and CI/CD pipelines.",
                        List.of(4))
        ));

        seedModules(uiux, List.of(
                new ModuleSpec("UX Foundations",
                        "Design thinking and turning ideas into low- and high-fidelity prototypes.",
                        List.of(1, 2)),
                new ModuleSpec("Visual Design",
                        "Visual systems, typography, and reusable component libraries.",
                        List.of(3)),
                new ModuleSpec("Validation",
                        "Run usability tests and iterate based on what you learn.",
                        List.of(4))
        ));

        seedModules(mobile, List.of(
                new ModuleSpec("React Native Foundations",
                        "Project setup, core components, and navigation.",
                        List.of(1, 2)),
                new ModuleSpec("Building the App",
                        "Connect APIs, manage state, and animate native interactions.",
                        List.of(3, 4)),
                new ModuleSpec("Shipping",
                        "Build, sign, and publish to the App Store and Google Play.",
                        List.of(5))
        ));

        log.info("Seeded modules for all courses.");

        // --- Achievements ---
        log.info("Seeding achievements...");

        achievementRepository.save(Achievement.builder()
                .user(admin)
                .badgeName("First Login")
                .badgeIcon("trophy")
                .build());

        achievementRepository.save(Achievement.builder()
                .user(admin)
                .badgeName("7-Day Streak")
                .badgeIcon("flame")
                .build());

        log.info("Seeded 2 achievements.");

        // --- Enrollments ---
        log.info("Seeding enrollments...");

        seedEnrollment(student, fullStack);
        seedEnrollment(student, react);
        seedEnrollment(student, python);
        seedEnrollment(admin, fullStack);

        log.info("Seeded enrollments.");

        // Services + trainer (idempotent: also called from the early-return
        // branch above so both fresh and previously-seeded DBs get them).
        seedServicesAndTrainer(trainerRole);

        log.info("Database seeding complete!");
    }

    // ─── Services seed ─────────────────────────────────────────────
    // Services share the courses table (type=SERVICE). Idempotent on email
    // and slug — re-running this method is safe.
    //
    // NOTE on instructor_id: Course.instructor is JPA-mapped @ManyToOne
    // nullable=false, so the schema requires it. For services we set both
    // instructor and trainer to the trainer user (Meera). The CourseDTO and
    // frontend already prefer trainer over instructor when type=SERVICE
    // (see ServiceCard, /services/[id], cart). The task spec asked for
    // instructor_id=NULL; honoring that would need a schema + entity change
    // (loosen nullable=false), which is out of scope for a seed-data task.
    private void seedServicesAndTrainer(Role trainerRole) {
        User meera = userRepository.findByEmail("meera@spire.dev")
                .orElseGet(() -> {
                    log.info("Seeding trainer user: meera@spire.dev");
                    return userRepository.save(User.builder()
                            .email("meera@spire.dev")
                            .passwordHash(passwordEncoder.encode("password123"))
                            .fullName("Meera Iyer")
                            .role(trainerRole)
                            .bio("Career coach with 12+ years guiding professionals through resumes, interviews, and placement.")
                            .build());
                });

        seedService(meera,
                "professional-resume-preparation",
                "Professional Resume Preparation",
                "Build a resume that gets you interviews. Learn formatting, content strategy, and ATS optimization.",
                "A practical, video-based walk-through of how to write a resume that survives applicant tracking systems and reads well to a human recruiter. Covers formats, content strategy, and the small details that separate good resumes from great ones.",
                1999,
                List.of(
                        new SvcModule("Resume Fundamentals",
                                "Start with what recruiters actually look at and the formats that work today.",
                                List.of(
                                        new SvcLesson("What Recruiters Look For", 15),
                                        new SvcLesson("Resume Formats: Chronological vs Functional", 12),
                                        new SvcLesson("ATS-Friendly Formatting", 10)
                                )),
                        new SvcModule("Content Strategy",
                                "Turn responsibilities into impact statements that convince.",
                                List.of(
                                        new SvcLesson("Writing Impact Statements", 18),
                                        new SvcLesson("Quantifying Your Achievements", 14),
                                        new SvcLesson("Tailoring for Each Application", 12)
                                )),
                        new SvcModule("Final Polish",
                                "Avoid the common mistakes and build an iteration habit.",
                                List.of(
                                        new SvcLesson("Common Mistakes to Avoid", 10),
                                        new SvcLesson("Review and Iteration Process", 15)
                                ))
                ));

        seedService(meera,
                "interview-training-masterclass",
                "Interview Training Masterclass",
                "Prepare for technical and behavioral interviews with proven frameworks and real practice scenarios.",
                "End-to-end interview preparation: behavioral storytelling with STAR, technical whiteboarding, system design framing, and the soft-skill moments that decide offers.",
                2999,
                List.of(
                        new SvcModule("Interview Fundamentals",
                                "Map the interview landscape and prepare a research-backed plan.",
                                List.of(
                                        new SvcLesson("Understanding Interview Types", 12),
                                        new SvcLesson("The STAR Method for Behavioral Questions", 18),
                                        new SvcLesson("Research and Preparation Checklist", 10)
                                )),
                        new SvcModule("Technical Interviews",
                                "Whiteboard, system design, and the patterns behind coding rounds.",
                                List.of(
                                        new SvcLesson("Whiteboard Problem-Solving Approach", 20),
                                        new SvcLesson("System Design Interview Framework", 25),
                                        new SvcLesson("Coding Interview Patterns", 22)
                                )),
                        new SvcModule("Soft Skills & Negotiation",
                                "Handle pressure, negotiate well, and follow up with intent.",
                                List.of(
                                        new SvcLesson("Handling Tough Questions", 15),
                                        new SvcLesson("Salary Negotiation Strategies", 18),
                                        new SvcLesson("Post-Interview Follow-Up", 10)
                                ))
                ));

        seedService(meera,
                "linkedin-profile-optimization",
                "LinkedIn Profile Optimization",
                "Transform your LinkedIn profile into a powerful career tool that attracts recruiters and opportunities.",
                "Make your LinkedIn profile work for you. Headline, summary, experience, content, and a connection strategy that gets you noticed by the right people.",
                999,
                List.of(
                        new SvcModule("Profile Essentials",
                                "Get the basics right — the parts recruiters scan first.",
                                List.of(
                                        new SvcLesson("Headline and Summary That Stand Out", 15),
                                        new SvcLesson("Experience Section Best Practices", 12),
                                        new SvcLesson("Skills, Endorsements, and Recommendations", 10)
                                )),
                        new SvcModule("Advanced LinkedIn Strategy",
                                "Move beyond the static profile — content, networks, and search.",
                                List.of(
                                        new SvcLesson("Content Creation for Visibility", 18),
                                        new SvcLesson("Networking and Connection Strategy", 14),
                                        new SvcLesson("Using LinkedIn for Job Search", 16)
                                ))
                ));

        seedService(meera,
                "placement-assistance-program",
                "Placement Assistance Program",
                "End-to-end job placement support including job search strategy, application tracking, and interview prep.",
                "A complete placement playbook: identify targets, build a pipeline, write strong cover letters, and close offers without leaving money on the table.",
                4999,
                List.of(
                        new SvcModule("Job Search Strategy",
                                "Pick the right targets and build a pipeline you can manage.",
                                List.of(
                                        new SvcLesson("Identifying Target Companies", 15),
                                        new SvcLesson("Job Board and Referral Strategy", 18),
                                        new SvcLesson("Building Your Application Pipeline", 12)
                                )),
                        new SvcModule("Application Process",
                                "From cover letter to portfolio to follow-up.",
                                List.of(
                                        new SvcLesson("Cover Letter Writing", 14),
                                        new SvcLesson("Portfolio and GitHub Presentation", 16),
                                        new SvcLesson("Following Up Effectively", 10)
                                )),
                        new SvcModule("Closing the Deal",
                                "Evaluate, negotiate, and ramp up.",
                                List.of(
                                        new SvcLesson("Evaluating Job Offers", 15),
                                        new SvcLesson("Negotiation and Acceptance", 12),
                                        new SvcLesson("First 90 Days at Your New Job", 18)
                                ))
                ));
    }

    private void seedService(User trainer, String slug, String title, String shortDescription,
                             String description, int priceRupees, List<SvcModule> modules) {
        if (courseRepository.findBySlug(slug).isPresent()) {
            return; // already seeded
        }

        int totalLessons = modules.stream().mapToInt(m -> m.lessons().size()).sum();
        int totalMinutes = modules.stream()
                .flatMap(m -> m.lessons().stream())
                .mapToInt(SvcLesson::durationMinutes)
                .sum();

        Course service = courseRepository.save(Course.builder()
                .title(title)
                .slug(slug)
                .description(description)
                .shortDescription(shortDescription)
                .level(Course.Level.BEGINNER)
                .price(BigDecimal.valueOf(priceRupees))
                .isFree(priceRupees <= 0)
                .durationHours(Math.round(totalMinutes / 60.0 * 10.0) / 10.0)
                .type("SERVICE")
                .trainer(trainer)
                .instructor(trainer)   // see note in seedServicesAndTrainer
                .lessonsCount(totalLessons)
                .enrolledCount(0)
                .rating(0.0)
                .ratingsCount(0)
                .category("Career Services")
                .isPublished(true)
                .build());

        int lessonOrder = 1;
        for (int mIdx = 0; mIdx < modules.size(); mIdx++) {
            SvcModule mod = modules.get(mIdx);
            Module module = moduleRepository.save(Module.builder()
                    .course(service)
                    .title(mod.title())
                    .description(mod.description())
                    .orderIndex(mIdx)
                    .build());
            for (SvcLesson l : mod.lessons()) {
                boolean isFirstLesson = (lessonOrder == 1);
                lessonRepository.save(Lesson.builder()
                        .course(service)
                        .module(module)
                        .title(l.title())
                        .orderIndex(lessonOrder)
                        .durationMinutes(l.durationMinutes())
                        .isFree(isFirstLesson) // first lesson is a free preview
                        .build());
                lessonOrder++;
            }
        }

        log.info("Seeded service: {} ({} lessons, ~{}h)", slug, totalLessons,
                Math.round(totalMinutes / 60.0 * 10.0) / 10.0);
    }

    private record SvcLesson(String title, int durationMinutes) {}
    private record SvcModule(String title, String description, List<SvcLesson> lessons) {}

    private void seedEnrollment(User user, Course course) {
        if (!enrollmentRepository.existsByUserIdAndCourseId(user.getId(), course.getId())) {
            enrollmentRepository.save(Enrollment.builder()
                    .user(user)
                    .course(course)
                    .build());
            course.setEnrolledCount(course.getEnrolledCount() + 1);
            courseRepository.save(course);
        }
    }

    private void seedLessons(Course course, List<String[]> lessonData) {
        for (int i = 0; i < lessonData.size(); i++) {
            String[] data = lessonData.get(i);
            lessonRepository.save(Lesson.builder()
                    .course(course)
                    .title(data[0])
                    .description(data[1])
                    .orderIndex(i + 1)
                    .durationMinutes(Integer.parseInt(data[2]))
                    .isFree(i == 0)
                    .build());
        }
    }

    private void seedModules(Course course, List<ModuleSpec> specs) {
        List<Lesson> courseLessons = lessonRepository.findByCourseIdOrderByOrderIndex(course.getId());
        for (int mIdx = 0; mIdx < specs.size(); mIdx++) {
            ModuleSpec spec = specs.get(mIdx);
            Module module = moduleRepository.save(Module.builder()
                    .course(course)
                    .title(spec.title())
                    .description(spec.description())
                    .orderIndex(mIdx)
                    .build());
            for (int lessonOrderIndex : spec.lessonOrderIndices()) {
                for (Lesson lesson : courseLessons) {
                    if (lesson.getOrderIndex() == lessonOrderIndex) {
                        lesson.setModule(module);
                        lessonRepository.save(lesson);
                        break;
                    }
                }
            }
        }
    }

    private record ModuleSpec(String title, String description, List<Integer> lessonOrderIndices) {}
}
