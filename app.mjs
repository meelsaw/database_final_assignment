import express from 'express';
import dotenv from 'dotenv';
import mysql from 'mysql2';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create MySQL database connection
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

// Check MySQL connection
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL database:', err);
    return;
  }
  console.log('Connected to MySQL database!');
});

// To see all courses
app.get('/courses', (req, res) => {
  const sql = `
    SELECT
	    c.Title
    FROM 
	    mydb.courses AS c
  `;

  connection.query(sql, (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(200).json(result);
  });
});

// Testing get all users
// app.get('/users', (req, res) => {
//   connection.query('SELECT Name ROM mydb.users', (err, results) => {
//     if (err) {
//       console.error('Error executing SQL query:', err);
//       res.status(500).json({ error: 'Internal server error' });
//       return;
//     }
//     res.json(results);
//   });
// });

// Testing creating new user
// app.post('/users', (req, res) => {
//   const {UserID, Name, RoleID} = req.body;

//   connection.query(
//     'INSERT INTO users (UserID, Name, RoleID) VALUES (?, ?, ?)',
//     [UserID, Name, RoleID],
//     (err, result) => {
//       if (err) {
//         console.error('Error executing SQL query:', err);
//         res.status(500).json({ error: 'Internal server error' });
//         return;
//       }
//       res.json({ message: 'User created successfully' });
//     }
//   );
// });

// Functional requirement 1: admins should be able to enable or disable the availability of a course
app.put("/courses/availability", (req, res) => {
  const { UserID, CourseID, isAvailable } = req.body;

  // Validate isAvailable input it should be 0 or 1
  if (isAvailable > 1) {
    return res.status(400).json({
      msg: "Invalid value for isAvailable. Must be an int (1 or 0).",
    });
  }
  const SQL1 = `
    SELECT 
	    r.RoleID
    FROM
	    mydb.users AS r
    WHERE
	    r.UserID = ?
  `;
  try {
    connection.query(SQL1, UserID, (err, results) => {
      if (err) throw err;
      if (results[0].RoleID === 1) {
        const SQL2 = `
          UPDATE mydb.courses AS c
          SET c.isAvailable = ?
          WHERE c.CourseID = ? 
        `;

        connection.query(SQL2, [isAvailable, CourseID], (err) => {
          if (err) throw err;

          const availabilityMsg = isAvailable ? "available" : "unavailable";
          res.status(200).json({ msg: `Course is now ${availabilityMsg}` });
        });
      } else
        res.status(403).json({
          msg: "Permission denied. Only admins can perform this action.",
        });
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});

// Functional requirement 2: Admins should be able to assign one or more courses to a teacher
app.post('/courses/assign', (req, res) => {
  const { UserID, teacherId, courseIds } = req.body;

  // construct an array for course ID
  const CourseIDArr1 = courseIds.split(",");

  const SQL1 = `
    SELECT 
      r.RoleID
      FROM
        mydb.users AS r
    WHERE
      r.UserID = ? 
  `;

  connection.query(SQL1, UserID, (err, results) => {
    if (err) {
      console.error("Error executing SQL query (SQL1):", err);
      return res.status(500).json({ msg: "Internal Server Error" });
    }

    try {
      if (results[0]?.RoleID === 1) {
        // Only admins can proceed with the assignment

        // Check if teacherId is valid (perform additional validation?)
        if (!teacherId) {
          return res.status(400).send('Invalid teacherId.');
        }

        // set assignments into Courses table with individual SQL queries
        const insertQuery = `
          UPDATE mydb.courses AS c
          SET c.TeacherID = ?
          WHERE c.CourseID = ?
        `;

        // Loop through CourseIDArr1 and execute individual queries
        // The for loop update will catch incorrect course ids
        // without failiing on the correct ones
        for (let i = 0; i < CourseIDArr1.length; i++) {
          const courseID = CourseIDArr1[i];
          connection.query(insertQuery, [teacherId, courseID], (err) => {
            if (err) {
              console.error('Error assigning courses to teacher: ', err);
              res.status(500).send('Internal Server Error');
              return;
            } else if (i === CourseIDArr1.length - 1) {
              // Respond only after the last query has been executed
              res.status(200).send('Courses assigned to teacher successfully');
            }
          });
        }
      } else {
        res.status(403).send('Permission denied. Only admins can perform this action.');
      }

    } catch (adminException) {
      console.error('Error processing admin query results:', adminException);
      res.status(500).send('Internal Server Error');
    }
  });
});

// Functional requirement 3: Students can browse 
// and list all the available courses and see the course title and course teacher's name.
app.get('/course/view', (req, res) => {
  const query = `
    SELECT
	    c.Title
      , u.Name
    FROM 
	    mydb.courses AS c
      LEFT JOIN mydb.users AS u
		    ON u.UserID=c.TeacherID
    WHERE 
	    c.isAvailable=1
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching available courses: ', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    res.status(200).json(results);
  });
});

// Functional requirement 4: "Students can enrol in a course. Students should not be able to enrol in a course more than once at each time.
app.post('/enrollments', (req, res) => {
  const { UserID, CourseID } = req.body;

  const SQL1 = `
  SELECT 
    r.RoleID
    FROM
      mydb.users AS r
  WHERE
    r.UserID = ? 
`;

  connection.query(SQL1, UserID, (err, results) => {
    if (err) {
      console.error("Error executing SQL query (SQL1):", err);
      return res.status(500).json({ msg: "Internal Server Error" });
    }

    try {
      if (results[0]?.RoleID === 3) {
        // Only students can proceed with the enrollment

        // Check if the student is already enrolled in the course
        const checkEnrollmentQuery = `
          SELECT 
	          EnrolmentID
          FROM 
            mydb.enrolments
          WHERE 
            UserID = ?
            AND CourseID = ?
        `;

        connection.query(checkEnrollmentQuery, [UserID, CourseID], (enrollCheckErr, enrollCheckResults) => {
          if (enrollCheckErr) {
            console.error('Error checking enrollment: ', enrollCheckErr);
            res.status(500).send('Internal Server Error');
            return;
          }

          if (enrollCheckResults.length > 0) {
            // Student is already enrolled in the course
            res.status(400).send('Student is already enrolled in the course.');
            return;
          }

          // If not enrolled, proceed with the enrollment
          const enrollQuery = `
          INSERT INTO mydb.enrolments (UserID, CourseID)
          VALUES (?,?)
          `;
          // mark default value is set to Null in the schema
          // otherwise use: const mark = null and pass it into the query   
          connection.query(enrollQuery, [UserID, CourseID], (enrollErr) => {
            if (enrollErr) {
              console.error('Error enrolling student in the course: ', enrollErr);
              res.status(500).send('Internal Server Error');
              return;
            }

            res.status(200).send('Student enrolled in the course successfully');
          });
        });
      } else {
        res.status(403).send('Permission denied. Only students can enroll in a course.');
      }
    } catch (studentException) {
      console.error('Error processing student query results:', studentException);
      res.status(500).send('Internal Server Error');
    }
  });
});


// Functional requirement 5: "Teacher can fail or pass a student."
app.put('/grade', (req, res) => {
  const { UserID, teacherId, CourseID, mark } = req.body;
  // const CourseID = req.body;
  // const { mark } = req.body;

  const SQL1 = `
    SELECT 
      r.RoleID
    FROM
      mydb.users AS r
    WHERE
      r.UserID = ?  
  `;

  connection.query(SQL1, teacherId, (err, results) => {
    if (err) {
      console.error("Error executing SQL query (SQL1):", err);
      return res.status(500).json({ msg: "Internal Server Error" });
    }

    try {
      if (results[0]?.RoleID === 2) {
        // Only teachers can proceed with updating the student's mark

        // Update the Mark column in the enrolments table
        const updateMarkQuery = `
          UPDATE mydb.enrolments
          SET Mark = ?
          WHERE CourseID = ? AND UserID = ?
        `;

        connection.query(updateMarkQuery, [mark, CourseID, UserID], (updateMarkErr, updateMarkResults) => {
          if (updateMarkErr) {
            console.error('Error updating student mark: ', updateMarkErr);
            res.status(500).send('Internal Server Error');
            return;
          }

          if (updateMarkResults.affectedRows === 0) {
            res.status(404).send('Enrolment not found');
            return;
          }

          res.status(200).send('Student mark updated successfully');
        });
      } else {
        res.status(403).send('Permission denied. Only teachers can update student marks.');
      }
    } catch (teacherException) {
      console.error('Error processing teacher query results:', teacherException);
      res.status(500).send('Internal Server Error');
    }
  });
});


// Start the server
const port = 8000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});