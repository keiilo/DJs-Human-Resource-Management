import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

const Payroll = sequelize.define("Payroll", {
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  periodStart: { type: DataTypes.DATEONLY, allowNull: false },
  periodEnd: { type: DataTypes.DATEONLY, allowNull: false },
  basicSalary: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  allowances: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  overtime: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  deductions: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  netSalary: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  status: {
    type: DataTypes.ENUM("Draft", "Processed", "Paid"),
    allowNull: false,
    defaultValue: "Draft"
  },
  processedBy: { type: DataTypes.INTEGER, allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true }
});

export default Payroll;
