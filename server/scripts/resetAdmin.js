import bcrypt from "bcryptjs";
import db from "../database.js";

const username = "suyesh"; // change if needed
const newPassword = "admin123";

const user = db.getUserByUsername(username);

if (!user) {
  console.log("User not found:", username);
  process.exit(1);
}

const hash = await bcrypt.hash(newPassword, 10);

// THIS is the correct function based on your auth code
db.setPassword(user.id, hash);

console.log("✅ Password reset successful!");
console.log("Username:", username);
console.log("New password:", newPassword);