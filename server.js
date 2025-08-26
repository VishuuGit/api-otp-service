const express = require("express");
const otpRoutes = require("./routes/otpRoutes");

const app = express();
app.use(express.json());

// Routes
app.use("/otp", otpRoutes);

// Start server
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
