# DJs Human Resource Management System (DJs HRMS)

A web-based HR system for DJ's FoodHub. It keeps employee records, departments, daily attendance,
leave requests and payroll in one place, with separate access for administrators, HR staff and
employees.

Built on the XianFire Framework (Node.js and Express)
with MySQL, Sequelize and server-rendered `.xian` (Handlebars) views styled with Tailwind CSS.

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Company overview for admin and staff: headcount, attendance today, weekly chart, pending leaves, payroll this month. A notification panel lists pending leave requests. Employees get a personal dashboard instead. |
| **Employees** | Add, view, edit and delete employee records. Employee IDs are generated (`EMP-0001`). Search and filter by department and status. |
| **Departments** | Create departments, set a department head, assign employees. A department with employees cannot be deleted. |
| **Attendance** | Employees check in and out themselves. Check-in after 8:00 AM is marked **Late** with the minutes counted. HR records or corrects attendance for any date. |
| **Leave Management** | Employees file leave; admin or staff approve or reject it. Leave balances per type are tracked per calendar year and enforced on filing and on approval. Rest days are not counted. |
| **Payroll** | Admin creates payroll per period: net pay = basic + allowances + overtime − deductions. Status goes Draft → Processed → Paid. Employees see only their own non-draft payslips. |
| **Reports** | Printable employee, department, attendance, leave and payroll reports for a date range. |
| **User Accounts** | Admin creates accounts, changes roles, resets passwords and links an account to an employee record. |

Every table shows 9 rows per page. Deletes and other final actions ask for confirmation in a dialog.
The interface has a dark and a light theme.

## Roles

| Role | Access |
|---|---|
| **Admin** | Everything, including payroll, user accounts and deleting records |
| **Staff** (HR) | Employees, departments (view), attendance, leave approval, reports except payroll |
| **Employee** | Own profile, own attendance (check in / out), filing leave, own payslips |

Access is checked on the server for every route, so typing a URL directly shows **Access Denied**
for a page the role may not open. Public registration always creates an **employee** account that
is not linked to any employee record; only an administrator links accounts to employees.

## Business rules

| Rule | Value |
|---|---|
| Office start (late after this) | 8:00 AM |
| Self check-in window | 5:00 AM to 5:00 PM |
| Rest days (not counted as leave days) | Sunday, set with `HR_REST_DAYS` |
| Annual leave allocation | Vacation 15, Sick 15, Maternity 105, Paternity 7, Emergency 5, Unpaid unlimited |
| Overlapping leave | Refused while another pending or approved leave covers the same dates |
| Duplicate payroll | Refused for the same employee and period |

## Requirements

- Node.js 20 or newer
- MySQL 8 (for example [Laragon](https://laragon.org/)), with user `root` and no password by default

## Getting started

```bash
git clone https://github.com/keiilo/DJs-Human-Resource-Management.git
cd DJs-Human-Resource-Management
npm install
```

1. Start MySQL (in Laragon: **Start All**).
2. Copy `.env.example` to `.env` and change the values if your database is different.
3. Create the database, tables, default departments and the first administrator:

   ```bash
   npm run migrate
   ```

   It asks for the administrator's name, email and password (at least 8 characters). To skip the
   questions, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` first. Running it again is safe: it
   only creates what is missing and never deletes data.

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000> and sign in with the administrator account.

## Configuration

Settings are read from `.env` in the project folder. Values already set in the shell win.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `SESSION_SECRET` | development value | Signs the login cookie. Set your own in production |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `ERP` | Database name |
| `DB_USER` | `root` | MySQL user |
| `DB_PASS` | *(empty)* | MySQL password |
| `HR_REST_DAYS` | `0` | Rest days, comma list from `0` (Sunday) to `6` (Saturday) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | *(empty)* | First administrator for `npm run migrate` |

Never commit `.env`; it is listed in `.gitignore`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app with nodemon; restarts when `.js`, `.json` or `.xian` files change |
| `npm start` | Starts the app without auto-restart |
| `npm run migrate` | Creates the database and missing tables, seeds departments and the first admin |
| `npm run route:list` | Lists every route |
| `npm run create:model` / `create:controller` | XianFire generators for new files |

## Project structure

```
config/        env.js loads .env before anything else
controllers/   request handling for each module (employees, attendance, leave, payroll, ...)
middleware/    login and role checks (requireAuth, requireRole)
models/        Sequelize models and their relations (User, Employee, Department, Attendance, Leave, Payroll)
routes/        every URL and the role allowed to open it
utils/         date and money formatting, HR rules (late, rest days, leave days), pagination
views/         .xian pages; partials/ holds the sidebar, header, footer, modals and pagination
public/        CSS (theme.css for light mode), images
index.js       Express app: sessions, flash messages, view engine, routes
migrate.js     safe database setup
```

The app follows MVC: a request goes to a route, the route's role check runs, the controller reads
or writes through the models, and a `.xian` view renders the page.

## Security

- Passwords are hashed with bcrypt.
- Sessions use an `httpOnly`, `sameSite` cookie that expires after 8 hours, and the session ID is
  regenerated at login.
- A failed login always says "Invalid email or password", so it does not reveal which emails exist.
- All database access goes through Sequelize, which uses parameterised queries.
- At least one administrator always remains: the last admin cannot be deleted or demoted.

## Credits

- XianFire Framework by Christian I. Cabrera, Mindoro State University (MIT License)
- This HR module is also part of **DJ's ERP**, the group system that connects HR with Accounting,
  POS and Inventory, Procurement and Customer Logs.
