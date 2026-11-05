import { sequelize } from "./db.js";
import User from "./userModel.js";
import Employee from "./EmployeeModel.js";
import Department from "./DepartmentModel.js";
import Attendance from "./AttendanceModel.js";
import Leave from "./LeaveModel.js";
import Payroll from "./PayrollModel.js";

// Accounts <-> employee records
User.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" });
Employee.hasOne(User, { foreignKey: "employeeId", as: "account" });

// Department head
Department.belongsTo(Employee, { foreignKey: "headId", as: "head", onDelete: "SET NULL" });
Employee.hasMany(Department, { foreignKey: "headId", as: "headedDepartments" });

// Attendance
Employee.hasMany(Attendance, { foreignKey: "employeeId", as: "attendances", onDelete: "CASCADE" });
Attendance.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" });

// Leaves
Employee.hasMany(Leave, { foreignKey: "employeeId", as: "leaves", onDelete: "CASCADE" });
Leave.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" });
Leave.belongsTo(User, { foreignKey: "reviewedBy", as: "reviewer", onDelete: "SET NULL" });

// Payroll
Employee.hasMany(Payroll, { foreignKey: "employeeId", as: "payrolls", onDelete: "CASCADE" });
Payroll.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" });
Payroll.belongsTo(User, { foreignKey: "processedBy", as: "processor", onDelete: "SET NULL" });

export const syncDatabase = async () => {
  await sequelize.authenticate();
  // Never force/alter: only creates missing tables (existing data is preserved).
  await sequelize.sync();
};

export { sequelize, User, Employee, Department, Attendance, Leave, Payroll };
