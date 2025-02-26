"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMentorAvailability = exports.updateMentorByID = exports.insertManyMentors = void 0;
const prismaClient_1 = __importDefault(require("../prismaClient"));
let idNumber = 0;
function cleanTimeSlot(timeSlot) {
    // Remove _N suffix from timeslots (e.g., "10:00am to 10:30am_1" -> "10:00am to 10:30am")
    return timeSlot.replace(/_\d+$/, "");
}
function convertTimeStringToDate(timeStr) {
    // Parse time (assuming 12-hour format)
    const [hourMin, period] = timeStr.split(/(?=[ap]m)/i);
    const [hours, minutes] = hourMin.split(":");
    // Convert to 24-hour format
    let hour = parseInt(hours);
    if (period.toLowerCase() === "pm" && hour !== 12) {
        hour += 12;
    }
    if (period.toLowerCase() === "am" && hour === 12) {
        hour = 0;
    }
    // Set the date to a fixed value (e.g., 2024-10-01) for consistent parsing
    const date = new Date("2024-10-01");
    date.setHours(hour, parseInt(minutes), 0, 0);
    console.log("date", date);
    return date;
}
const insertManyMentors = async (request, response) => {
    const mentors = request.body.data;
    // console.log("request body", request.body);
    const validationErrors = validateMentors(mentors);
    if (validationErrors.length > 0) {
        return response
            .status(400)
            .json({ error: "Validation error", details: validationErrors });
    }
    try {
        // console.log("Calling create mentors", mentors);
        const createdMentors = callCreate(mentors);
        response
            .status(201)
            .json({ message: "Mentors have been created", createdMentors });
    }
    catch (error) {
        console.log("entering error");
        response.status(500).json({ error: error.message });
    }
};
exports.insertManyMentors = insertManyMentors;
const updateMentorByID = async (request, response) => {
    const mentor = request.body.data;
    const mentors = [mentor];
    const validationErrors = validateMentors(mentors);
    if (validationErrors.length > 0) {
        return response
            .status(400)
            .json({ error: "Validation error", details: validationErrors });
    }
    try {
        console.log("Calling edit", mentor);
        const editedMentor = callEditByID(mentor);
        response
            .status(201)
            .json({ message: "Mentor has been edited", editedMentor });
    }
    catch (error) {
        console.log("entering error");
        response.status(500).json({ error: error.message });
    }
};
exports.updateMentorByID = updateMentorByID;
const addMentorAvailability = async (request, response) => {
    const mentors = request.body.data;
    // console.log("request body", request.body);
    console.log("request.body.data", request.body.data);
    try {
        const updatedMentors = await addAvailability(mentors);
        response
            .status(201)
            .json({ message: "Mentor availability has been added", updatedMentors });
    }
    catch (error) {
        console.log("entering error");
        response.status(500).json({ error: error.message });
    }
};
exports.addMentorAvailability = addMentorAvailability;
// Function to perform custom validation
function validateMentors(mentors) {
    const errors = [];
    // Example of validation logic (you can customize this based on your requirements)
    mentors.forEach((mentor, index) => {
        if (!mentor.name) {
            errors.push(`Mentor at index ${index} does not have a first name.`);
        }
        /*
        if (!mentor.mentor_id) {
          errors.push("Mentor id is necessary");
        }
        if(typeof(mentor.mentor_id) !== "number") {
          errors.push('Mentor id must be a number')
        }
    
        if (mentor.MentorAvailability) {
          errors.push('Must indicate mentor availibility')
        }*/
        // if (!mentor.program) {
        //   errors.push('Must enter current program of education')
        // }
    });
    return errors;
}
const addAvailability = async (mentor_data) => {
    try {
        for (const data of mentor_data) {
            await prismaClient_1.default.mentor.upsert({
                where: { mentor_id: parseInt(data["Student ID"]) },
                create: {
                    mentor_id: parseInt(data["Student ID"]),
                    name: data["Full Name"],
                    email_address: data["Email Address"],
                    Program: data.Program,
                    year: data.Year,
                    MentorAvailability: {
                        create: Object.entries(data.availability).flatMap(([day, timeSlots]) => timeSlots.map((slot) => {
                            const timeRange = cleanTimeSlot(slot);
                            const [startTime, endTime] = timeRange.split(" to ");
                            console.log("startTime", convertTimeStringToDate(startTime));
                            console.log("endTime", convertTimeStringToDate(endTime));
                            console.log("day", day);
                            console.log("timeRange", timeRange);
                            console.log("data", data);
                            return {
                                availability: {
                                    connectOrCreate: {
                                        where: {
                                            unique_avail: {
                                                day,
                                                start_time: convertTimeStringToDate(startTime),
                                                end_time: convertTimeStringToDate(endTime),
                                            },
                                        },
                                        create: {
                                            day,
                                            start_time: convertTimeStringToDate(startTime),
                                            end_time: convertTimeStringToDate(endTime),
                                        },
                                    },
                                },
                            };
                        })),
                    },
                },
                update: {
                    MentorAvailability: {
                        deleteMany: {},
                        create: Object.entries(data.availability).flatMap(([day, timeSlots]) => timeSlots.map((slot) => {
                            const timeRange = cleanTimeSlot(slot);
                            const [startTime, endTime] = timeRange.split(" to ");
                            return {
                                availability: {
                                    connectOrCreate: {
                                        where: {
                                            unique_avail: {
                                                day,
                                                start_time: convertTimeStringToDate(startTime),
                                                end_time: convertTimeStringToDate(endTime),
                                            },
                                        },
                                        create: {
                                            day,
                                            start_time: convertTimeStringToDate(startTime),
                                            end_time: convertTimeStringToDate(endTime),
                                        },
                                    },
                                },
                            };
                        })),
                    },
                },
            });
        }
    }
    catch (error) {
        console.error("Error in addAvailability:", error);
        throw error;
    }
};
const callCreate = async (mentors) => {
    for (const mentor of mentors) {
        // console.log("mentor XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", mentor);
        for (const course of mentor.courses) {
            await prismaClient_1.default.course.upsert({
                where: { course_code: course },
                create: {
                    course_code: course,
                    course_name: course,
                },
                update: {},
            });
        }
        console.log("Processing mentor:", mentor.mentor_id);
        // Create or update mentor
        const createdMentor = await prismaClient_1.default.mentor.upsert({
            where: {
                mentor_id: mentor.mentor_id,
            },
            update: {
                // Update only provided fields, preserve existing ones
                ...(mentor.name && { name: mentor.name }),
                ...(mentor.email_address && { email_address: mentor.email_address }),
                ...(mentor.program && { Program: mentor.program }),
                ...(mentor.year && { year: mentor.year }),
                // If courses provided, update courses
                ...(mentor.courses?.length > 0 && {
                    MentorCourse: {
                        deleteMany: {},
                        create: mentor.courses.map((course) => ({
                            course: { connect: { course_code: course } },
                        })),
                    },
                }),
                // If availability provided, update availability
                ...(Object.keys(mentor.availability || {}).length > 0 && {
                    MentorAvailability: {
                        deleteMany: {},
                        create: Object.entries(mentor.availability).flatMap(([day, slots]) => slots.map((slot) => {
                            const cleanedSlot = cleanTimeSlot(slot);
                            const [startTime, endTime] = cleanedSlot.split(" to ");
                            return {
                                availability: {
                                    connect: {
                                        unique_avail: {
                                            day,
                                            start_time: convertTimeStringToDate(startTime),
                                            end_time: convertTimeStringToDate(endTime),
                                        },
                                    },
                                },
                            };
                        })),
                    },
                }),
            },
            create: {
                mentor_id: mentor.mentor_id,
                name: mentor.name,
                email_address: mentor.email_address,
                Program: mentor.program,
                year: mentor.year,
                ...(mentor.courses?.length > 0 && {
                    MentorCourse: {
                        create: mentor.courses.map((course) => ({
                            course: { connect: { course_code: course } },
                        })),
                    },
                }),
                ...(Object.keys(mentor.availability || {}).length > 0 && {
                    MentorAvailability: {
                        create: Object.entries(mentor.availability).flatMap(([day, slots]) => slots.map((slot) => {
                            const cleanedSlot = cleanTimeSlot(slot);
                            const [startTime, endTime] = cleanedSlot.split(" to ");
                            return {
                                availability: {
                                    connect: {
                                        unique_avail: {
                                            day,
                                            start_time: convertTimeStringToDate(startTime),
                                            end_time: convertTimeStringToDate(endTime),
                                        },
                                    },
                                },
                            };
                        })),
                    },
                }),
            },
        });
        console.log("Mentor processed:", createdMentor.mentor_id);
    }
};
const callEditByID = async (mentor) => {
    // console.log("mentor", mentor);
    if (!mentor.mentor_id || typeof mentor.mentor_id !== "number") {
        return "Mentor id is necessary";
    }
    if (mentor.courses) {
        for (const course of mentor.courses) {
            // console.log("course", course);
            await prismaClient_1.default.course.upsert({
                where: { course_code: course },
                create: {
                    course_code: course,
                    course_name: course,
                },
                update: {},
            });
        }
    }
    // probably won't work
    // const availabilityCreates = [];
    // for (const [day, slots] of Object.entries(mentor.availability as MentorAvailability)) {
    //   for (const slot of slots) {
    //     const cleanedSlot = cleanTimeSlot(slot);
    //     const [startTime, endTime] = cleanedSlot.split(" to ");
    //     availabilityCreates.push({
    //       day: day,
    //       start_time: startTime,
    //       end_time: endTime
    //     });
    //   }
    // }
    const updatedMentors = await prismaClient_1.default.mentor.upsert({
        where: { mentor_id: mentor.id },
        update: {},
        create: {
            mentor_id: mentor.id,
            name: mentor.name,
            email_address: mentor.email_address,
            Program: mentor.program,
            year: mentor.year,
            MentorCourse: {
                create: mentor.courses.map((course) => ({
                    course: { connect: { course_code: course } },
                })),
            },
            // MentorAvailability: {
            //     create: availabilityCreates,
            // },
        },
    });
};
//# sourceMappingURL=mentor_controller.js.map