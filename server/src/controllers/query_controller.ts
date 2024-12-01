import prisma from '../prismaClient';

export const generateCsv = async (request, response) => {
  // Match all students with mentors
  const { matches, unmatchedStudents } = await findMatches();
  console.log("matches", matches);
  console.log("unmatchedStudents", unmatchedStudents);
  let csvContent = "";
  let unmatchedCsvContent = "";

  if (matches.length > 0) {
    // Convert matches to CSV format
    csvContent = convertToCsv(matches);

    // Here you would send the csvContent to the frontend (e.g., through an API response)
    console.log("CSV Content for Matched:\n", csvContent);
  } else {
    console.log('No students were matched with mentors.');
  }

  if (unmatchedStudents.length > 0) {
    // Convert unmatched students to CSV format
    unmatchedCsvContent = convertUnmatchedToCsv(unmatchedStudents);

    // Here you would send the unmatchedCsvContent to the frontend (e.g., through an API response)
    console.log("CSV Content for Unmatched Students:\n", unmatchedCsvContent);
  } else {
    console.log('All students were matched with mentors.');
  }

  const content = {csvContent, unmatchedCsvContent};
  // console.log("csvContent", csvContent);
  // console.log("unmatchedCsvContent", unmatchedCsvContent);
  console.log("content", content);

  try {
    return response.status(200).json(content);
  } catch (error) {
    console.log("error returning csv output");
    return response.status(500).json({ message: "Internal server error" });
  }
};

const findMatches = async () => {
  try {
    // Fetch all students with their courses and availability
    const students = await prisma.student.findMany({
      include: {
        StudentCourse: {
          include: {
            course: true,
          },
        },
        StudentAvailability: {
          include: {
            availability: true,
          },
        },
      },
    });

    let matches = [];
    let unmatchedStudents = [];

    // Loop through each student
    for (const student of students) {
      const studentCourseIds = student.StudentCourse.map((sc) => sc.course_id);
      const studentAvailabilities = student.StudentAvailability.map(sa => ({
        day: sa.availability.day,
        start_time: sa.availability.start_time,
        end_time: sa.availability.end_time,
      }));

      // Find mentors with matching courses
      const mentors = await prisma.mentor.findMany({
        where: {
          MentorCourse: {
            some: {
              course_id: { in: studentCourseIds },
            },
          },
        },
        include: {
          MentorCourse: {
            include: {
              course: true,
            },
          },
          MentorAvailability: {
            include: {
              availability: true,
            },
          },
        },
      });

      console.log('mentors', mentors.length);

      // If there are no mentors, mark the student as unmatched
      if (mentors.length === 0) {
        unmatchedStudents.push({
          studentId: student.student_id,
          studentEmail: student.email,
          studentFirstName: student.first_name,
          studentLastName: student.last_name,
        });
        continue;
      }

      // Find the mentor with the most overlapping courses but with fewer pairings
      let bestMentor = null;
      let maxOverlap = 0;
      let matchedTimeslots = [];

      mentors.forEach((mentor) => {
        const mentorCourseIds = mentor.MentorCourse.map((mc) => mc.course_id);
        const overlappingCourses = studentCourseIds.filter((courseId) =>
          mentorCourseIds.includes(courseId)
        );

        const mentorAvailabilities = mentor.MentorAvailability.map(ma => ({
          day: ma.availability.day,
          start_time: ma.availability.start_time,
          end_time: ma.availability.end_time,
        }));

        // Find overlapping timeslots
        const overlappingTimeslots = studentAvailabilities.filter(sTime => 
          mentorAvailabilities.some(mTime => 
            mTime.day === sTime.day &&
            mTime.start_time.getTime() === sTime.start_time.getTime() &&
            mTime.end_time.getTime() === sTime.end_time.getTime()
          )
        );

        const overlapCount = overlappingCourses.length;
        const hasTimeOverlap = overlappingTimeslots.length > 0;

        if (hasTimeOverlap && (
          (overlapCount > maxOverlap) ||
          (overlapCount === maxOverlap && mentor.Pairings < bestMentor?.Pairings)
        )) {
          bestMentor = mentor;
          maxOverlap = overlapCount;
          matchedTimeslots = overlappingTimeslots;
        }
      });

      if (bestMentor && maxOverlap > 0 && matchedTimeslots.length > 0) {
        const matchedCourses = student.StudentCourse.filter((sc) =>
          bestMentor.MentorCourse.some((mc) => mc.course_id === sc.course_id)
        );

        matches.push({
          studentId: student.student_id,
          studentEmail: student.email,
          studentFirstName: student.first_name,
          studentLastName: student.last_name,
          mentorId: bestMentor.mentor_id,
          mentorFirstName: bestMentor.name.split(" ")[0],
          mentorLastName: bestMentor.name.split(" ")[1],
          mentorEmail: bestMentor.email_address,
          courseName: matchedCourses
            .map((mc) => mc.course.course_name)
            .join(", "),
          matchedTimeslots: matchedTimeslots.map(slot => ({
            day: slot.day,
            startTime: slot.start_time,
            endTime: slot.end_time,
          })),
        });

        await prisma.mentor.update({
          where: { mentor_id: bestMentor.mentor_id },
          data: { Pairings: { increment: 1 } }, // Increment the Pairings count
        });
      } else {
        // If no mentor is found, mark the student as unmatched
        unmatchedStudents.push({
          studentId: student.student_id,
          studentEmail: student.email,
          studentFirstName: student.first_name,
          studentLastName: student.last_name,
        });
      }
    }

    return { matches, unmatchedStudents };
  } catch (error) {
    console.error(error);
    throw new Error("Failed to match students with mentors");
  }
};

// Function to convert matches to CSV format for frontend
const convertToCsv = (matches) => {
  const csvData = [];

  // Add header row with new timeslot columns
  csvData.push([
    "Student Name",
    "Student Email",
    "Mentor Name",
    "Mentor Email", 
    "Courses in Common",
    "Meeting Times"
  ]);
  
  // Iterate over each match
  matches.forEach((match) => {
    // Format timeslots as readable strings
    const formattedTimeslots = match.matchedTimeslots.map(slot => 
      `${slot.day} ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`
    ).join("; ");

    csvData.push([
      `${match.studentFirstName} ${match.studentLastName}`,
      match.studentEmail,
      `${match.mentorFirstName} ${match.mentorLastName}`,
      match.mentorEmail,
      match.courseName,
      formattedTimeslots
    ]);
  });

  // Convert array of arrays to CSV string
  const csvContent = csvData.map((row) => row.join(",")).join("\n");
  return csvContent;
};

// Helper function to format time
const formatTime = (time) => {
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes.toString().padStart(2, '0');
  return `${formattedHours}:${formattedMinutes}${ampm}`;
};

// Function to convert unmatched students to CSV format
const convertUnmatchedToCsv = (unmatchedStudents) => {
  const csvData = [];

  // Add header row
  csvData.push(["Student First Name", "Student Last Name", "Student Email", "Mentor First Name", "Mentor Last Name", "Mentor Email"]);
  
  // Iterate over each unmatched student and generate empty mentor info
  unmatchedStudents.forEach((student) => {
    csvData.push([
      student.studentFirstName,  // Student's first name
      student.studentLastName,   // Student's last name
      student.studentEmail,      // Student's email
      "",                        // No mentor first name (unmatched)
      "",                        // No mentor last name (unmatched)
      ""                         // No mentor email (unmatched)
    ]);
  });

  // Convert array of arrays to CSV string
  const csvContent = csvData.map((row) => row.join(",")).join("\n");
  return csvContent;
};