const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "localhost",  
  user: "root",        
  password: "Vishusql@123",     
  database: "otp_db",  
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
