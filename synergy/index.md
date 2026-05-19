# Synergy SIS — Query Reference Guide

**System:** Edupoint Synergy SIS
**Database Schema:** `[REV]`
**Prepared for:** Champion Schools

---

## Table of Contents

1. [ADM Historical — SQL Query](#_1-adm-historical-sql-query)
2. [ADM Daily — Synergy BO Query (Scheduled)](#_2-adm-daily-synergy-bo-query-scheduled)
3. [Student Retention Historical — SQL Query](#_3-student-retention-historical-sql-query)
4. [Enrollment History — SQL Query](#_4-enrollment-history-sql-query)
5. [Online Registration & Enrollment Tracking — Synergy BO Query (Scheduled)](#_5-online-registration-enrollment-tracking-synergy-bo-query-scheduled)
6. [End-of-Year Update Templates](#_6-end-of-year-update-templates)

---

## 1. ADM Historical — SQL Query

### Description

Calculates **Average Daily Membership (ADM)** by school year, campus, and grade for school years 2021 through 2024. ADM is the total number of student membership days divided by the number of instructional days in the school calendar.

### How It Works

- Pulls each student's `ENTER_DATE` and `LEAVE_DATE` from `EPC_STU_SCH_YR` and calculates the number of days they were enrolled
- Students without a `LEAVE_DATE` (still active) use `GETDATE()` as the end date
- Joins to `EPC_SCH_ATT_CAL` to get the actual count of instructional days, filtering out holidays (`Hol`, `Vac`, `Sta`, `Oth`) and keeping only `Non` (non-holiday/instructional) and `NULL` days
- Students flagged with `EXCLUDE_ADA_ADM` are excluded to match Synergy's standard ADM calculation
- Campus name is pulled from `REV_ORGANIZATION` via the `REV_ORGANIZATION_YEAR` bridge table

### Instructions

1. Navigate to `Synergy SIS > Query > SQL Query`
2. Paste the query below into the SQL Statement field
3. Click **Execute**
4. Adjust the `BETWEEN 2021 AND 2024` range as needed

> **Note:** The calendar join uses `SCHOOL_YEAR_GU` from `EPC_SCH_ATT_CAL` matched to `ORGANIZATION_YEAR_GU`. If `DaysInSession` returns NULL, the calendar may not be configured for that school/year in Synergy.

### Query

```sql
SELECT
    yr.SCHOOL_YEAR                                          AS SchoolYear,
    org.ORGANIZATION_NAME                                   AS Campus,
    md.GRADE                                                AS Grade,
    COUNT(DISTINCT md.STUDENT_GU)                           AS TotalStudents,
    SUM(md.StudentMembershipDays)                           AS TotalMembershipDays,
    dis.InstructionalDays                                   AS DaysInSession,
    CAST(SUM(md.StudentMembershipDays) AS FLOAT)
        / NULLIF(dis.InstructionalDays, 0)                  AS ADM
FROM
    (
        SELECT
            ssy.ORGANIZATION_YEAR_GU,
            ssy.GRADE,
            ssy.STUDENT_GU,
            DATEDIFF(DAY,
                ssy.ENTER_DATE,
                ISNULL(ssy.LEAVE_DATE, GETDATE())
            )                                               AS StudentMembershipDays
        FROM [REV].[EPC_STU_SCH_YR] ssy
        WHERE ssy.STATUS IS NULL
        AND ssy.EXCLUDE_ADA_ADM IS NULL
    ) md
    INNER JOIN [REV].[REV_ORGANIZATION_YEAR] oy
        ON md.ORGANIZATION_YEAR_GU = oy.ORGANIZATION_YEAR_GU
    INNER JOIN [REV].[REV_YEAR] yr
        ON oy.YEAR_GU = yr.YEAR_GU
    INNER JOIN [REV].[REV_ORGANIZATION] org
        ON oy.ORGANIZATION_GU = org.ORGANIZATION_GU
    LEFT JOIN (
        SELECT
            cal.SCHOOL_YEAR_GU                              AS ORGANIZATION_YEAR_GU,
            COUNT(cal.CAL_DATE)                             AS InstructionalDays
        FROM [REV].[EPC_SCH_ATT_CAL] cal
        WHERE cal.HOLIDAY = 'Non'
           OR cal.HOLIDAY IS NULL
        GROUP BY cal.SCHOOL_YEAR_GU
    ) dis ON dis.ORGANIZATION_YEAR_GU = md.ORGANIZATION_YEAR_GU
WHERE
    CAST(yr.SCHOOL_YEAR AS INT) BETWEEN 2021 AND 2024
GROUP BY
    yr.SCHOOL_YEAR,
    org.ORGANIZATION_NAME,
    md.GRADE,
    dis.InstructionalDays
ORDER BY
    yr.SCHOOL_YEAR,
    org.ORGANIZATION_NAME,
    md.GRADE
```

### Key Tables

| Table | Purpose |
|---|---|
| `REV.EPC_STU_SCH_YR` | Student enrollment records with enter/leave dates |
| `REV.REV_ORGANIZATION_YEAR` | Links students to school/year combos |
| `REV.REV_YEAR` | School year labels |
| `REV.REV_ORGANIZATION` | Campus names |
| `REV.EPC_SCH_ATT_CAL` | School attendance calendar with instructional day flags |

---

## 2. ADM Daily — Synergy BO Query (Scheduled)

### Description

A lightweight daily snapshot query that captures **active enrollment counts by school year and grade** as of the time it runs. Intended to be saved as a User-Defined Report and scheduled to run daily, building a time series dataset over time for trending and graphing.

### How It Works

- Roots on `K12.Student` and joins to `StudentSchoolYear` for grade and status
- Joins through `RevOrganizationYear` and `RevYear` to get the school year label
- Counts distinct students per grade per school year
- Filters out inactive students via `Status != 'I'` — verify this matches your district's inactive status code

### Instructions

1. Navigate to `Synergy SIS > Query > Query`
2. Click the **Type In Query** tab
3. Paste the query below
4. Click **Run** to verify results
5. Click **Save as Report** and name it (e.g., `Daily ADM Snapshot`)
6. Navigate to `Synergy SIS > System > Schedule` to set a daily recurrence
7. Make sure the query is focused to the correct school or district before scheduling

> **Note:** Each scheduled run produces a timestamped output file. Collect these over time to build your year-over-year graph.

> **Status Code:** The filter `R1.Status != 'I'` assumes `'I'` is the inactive/withdrawn code. Confirm this matches your district's setup by checking a known withdrawn student's `STATUS` value in `EPC_STU_SCH_YR`.

### Query

```
Student R0, K12.EnrollmentInfo.StudentSchoolYear R1,
Revelation.OrganizationInfo.RevOrganizationYear R2
(OrganizationYearGU,R1.OrganizationYearGU,Outer),
Revelation.OrganizationInfo.RevYear R3
(YearGU,R2.YearGU,Outer)
COLS R3.SchoolYear, R1.Grade,
R0.StudentGU (,'EnrolledCount',,,,,,,Count)
IF R1.Status != 'I'
Sort R3.SchoolYear, R1.Grade
```

---

## 3. Student Retention Historical — SQL Query

### Description

Calculates **year-over-year student retention** grouped by prior year teacher, grade, and homeroom section. A student is considered retained if they appear in the enrollment records for both the prior year and the current year. Results cover all consecutive year pairs from 2021 through 2025.

### How It Works

- Self-joins `EPC_STU_SCH_YR` on `STUDENT_GU` to find students enrolled in back-to-back years
- Uses `CAST(SCHOOL_YEAR AS INT) + 1` to match consecutive year pairs automatically
- Pulls the prior year's homeroom section via `HOMEROOM_SECTION_GU`
- Joins to `EPC_SCH_YR_SECT` for section ID, then to `EPC_STAFF_SCH_YR` and `EPC_STAFF` for the **primary teacher** (via `STAFF_SCHOOL_YEAR_GU` directly on the section — not the co-teacher `LINKED_STAFF_SCH_YR_GU`)
- Teacher name comes from `REV_PERSON` joined via `STAFF_GU = PERSON_GU`

### Instructions

1. Navigate to `Synergy SIS > Query > SQL Query`
2. Paste the query below into the SQL Statement field
3. Click **Execute**
4. Adjust the `>= 2021` threshold to change how far back the report goes

> **Primary vs. Co-Teacher:** The section table (`EPC_SCH_YR_SECT`) has two staff join columns. This query uses `STAFF_SCHOOL_YEAR_GU` (primary teacher). The co-teacher uses `LINKED_STAFF_SCH_YR_GU` — do not swap these.

### Query

```sql
SELECT
    prev_yr.SCHOOL_YEAR                                     AS PriorYear,
    curr_yr.SCHOOL_YEAR                                     AS CurrentYear,
    prev_ssy.GRADE                                          AS PriorGrade,
    prev_sect.SECTION_ID                                    AS PriorSection,
    prev_staff.BADGE_NUM                                    AS TeacherBadgeNum,
    prev_teacher.FIRST_NAME + ' ' + prev_teacher.LAST_NAME AS PriorTeacher,
    COUNT(DISTINCT curr_ssy.STUDENT_GU)                     AS RetainedStudents
FROM
    [REV].[EPC_STU_SCH_YR] curr_ssy
    INNER JOIN [REV].[REV_ORGANIZATION_YEAR] curr_oy
        ON curr_ssy.ORGANIZATION_YEAR_GU = curr_oy.ORGANIZATION_YEAR_GU
    INNER JOIN [REV].[REV_YEAR] curr_yr
        ON curr_oy.YEAR_GU = curr_yr.YEAR_GU
    INNER JOIN [REV].[EPC_STU_SCH_YR] prev_ssy
        ON prev_ssy.STUDENT_GU = curr_ssy.STUDENT_GU
    INNER JOIN [REV].[REV_ORGANIZATION_YEAR] prev_oy
        ON prev_ssy.ORGANIZATION_YEAR_GU = prev_oy.ORGANIZATION_YEAR_GU
    INNER JOIN [REV].[REV_YEAR] prev_yr
        ON prev_oy.YEAR_GU = prev_yr.YEAR_GU
    LEFT JOIN [REV].[EPC_SCH_YR_SECT] prev_sect
        ON prev_sect.SECTION_GU = prev_ssy.HOMEROOM_SECTION_GU
    LEFT JOIN [REV].[EPC_STAFF_SCH_YR] prev_staff_ssy
        ON prev_staff_ssy.STAFF_SCHOOL_YEAR_GU = prev_sect.STAFF_SCHOOL_YEAR_GU
    LEFT JOIN [REV].[EPC_STAFF] prev_staff
        ON prev_staff.STAFF_GU = prev_staff_ssy.STAFF_GU
    LEFT JOIN [REV].[REV_PERSON] prev_teacher
        ON prev_teacher.PERSON_GU = prev_staff.STAFF_GU
WHERE
    CAST(curr_yr.SCHOOL_YEAR AS INT) = CAST(prev_yr.SCHOOL_YEAR AS INT) + 1
    AND CAST(prev_yr.SCHOOL_YEAR AS INT) >= 2021
    AND curr_ssy.STATUS IS NULL
    AND prev_ssy.STATUS IS NULL
GROUP BY
    prev_yr.SCHOOL_YEAR,
    curr_yr.SCHOOL_YEAR,
    prev_ssy.GRADE,
    prev_sect.SECTION_ID,
    prev_staff.BADGE_NUM,
    prev_teacher.FIRST_NAME,
    prev_teacher.LAST_NAME
ORDER BY
    prev_yr.SCHOOL_YEAR,
    prev_ssy.GRADE,
    prev_teacher.LAST_NAME,
    prev_teacher.FIRST_NAME
```

### Key Tables

| Table | Purpose |
|---|---|
| `REV.EPC_STU_SCH_YR` | Student enrollment — self-joined for prior/current year comparison |
| `REV.REV_ORGANIZATION_YEAR` | Links to school year |
| `REV.REV_YEAR` | School year label |
| `REV.EPC_SCH_YR_SECT` | Homeroom section details |
| `REV.EPC_STAFF_SCH_YR` | Staff school year record |
| `REV.EPC_STAFF` | Staff record (badge number) |
| `REV.REV_PERSON` | Person name (shared table for students, staff, parents) |

---

## 4. Enrollment History — SQL Query

### Description

Shows **monthly active enrollment counts** by school year, campus, and grade for school years 2021 through 2024. Designed to feed a year-over-year enrollment trend graph, with monthly granularity for seasonality analysis.

### How It Works

- Uses a hardcoded month list (July through June for each school year) as a reference table to join against
- A student is counted as enrolled in a given month if their `ENTER_DATE` is before the end of that month AND their `LEAVE_DATE` is after the start of that month (or NULL, meaning still active)
- Campus name is pulled from `REV_ORGANIZATION`
- July is included as Champion Schools operates year-round

### Instructions

1. Navigate to `Synergy SIS > Query > SQL Query`
2. Paste the query below into the SQL Statement field
3. Click **Execute**
4. To extend the range, add additional `UNION ALL SELECT CAST('YYYY-MM-01' AS DATE)` lines to the month subquery and update the `BETWEEN` filter

> **Note:** Synergy's SQL Query tool does not support CTEs (`WITH` clauses) or `GENERATE_SERIES`. The month list is therefore hardcoded as a subquery. This is verbose but fully functional.

### Query

```sql
SELECT
    yr.SCHOOL_YEAR                                          AS SchoolYear,
    org.ORGANIZATION_NAME                                   AS Campus,
    ssy.GRADE                                               AS Grade,
    MONTH(months.MonthStart)                                AS MonthNumber,
    DATENAME(MONTH, months.MonthStart)                      AS MonthName,
    COUNT(DISTINCT ssy.STUDENT_GU)                          AS TotalEnrolled
FROM
    [REV].[EPC_STU_SCH_YR] ssy
    INNER JOIN [REV].[REV_ORGANIZATION_YEAR] oy
        ON ssy.ORGANIZATION_YEAR_GU = oy.ORGANIZATION_YEAR_GU
    INNER JOIN [REV].[REV_YEAR] yr
        ON oy.YEAR_GU = yr.YEAR_GU
    INNER JOIN [REV].[REV_ORGANIZATION] org
        ON oy.ORGANIZATION_GU = org.ORGANIZATION_GU
    INNER JOIN (
        SELECT CAST('2021-07-01' AS DATE) AS MonthStart UNION ALL
        SELECT CAST('2021-08-01' AS DATE) UNION ALL
        SELECT CAST('2021-09-01' AS DATE) UNION ALL
        SELECT CAST('2021-10-01' AS DATE) UNION ALL
        SELECT CAST('2021-11-01' AS DATE) UNION ALL
        SELECT CAST('2021-12-01' AS DATE) UNION ALL
        SELECT CAST('2022-01-01' AS DATE) UNION ALL
        SELECT CAST('2022-02-01' AS DATE) UNION ALL
        SELECT CAST('2022-03-01' AS DATE) UNION ALL
        SELECT CAST('2022-04-01' AS DATE) UNION ALL
        SELECT CAST('2022-05-01' AS DATE) UNION ALL
        SELECT CAST('2022-06-01' AS DATE) UNION ALL
        SELECT CAST('2022-07-01' AS DATE) UNION ALL
        SELECT CAST('2022-08-01' AS DATE) UNION ALL
        SELECT CAST('2022-09-01' AS DATE) UNION ALL
        SELECT CAST('2022-10-01' AS DATE) UNION ALL
        SELECT CAST('2022-11-01' AS DATE) UNION ALL
        SELECT CAST('2022-12-01' AS DATE) UNION ALL
        SELECT CAST('2023-01-01' AS DATE) UNION ALL
        SELECT CAST('2023-02-01' AS DATE) UNION ALL
        SELECT CAST('2023-03-01' AS DATE) UNION ALL
        SELECT CAST('2023-04-01' AS DATE) UNION ALL
        SELECT CAST('2023-05-01' AS DATE) UNION ALL
        SELECT CAST('2023-06-01' AS DATE) UNION ALL
        SELECT CAST('2023-07-01' AS DATE) UNION ALL
        SELECT CAST('2023-08-01' AS DATE) UNION ALL
        SELECT CAST('2023-09-01' AS DATE) UNION ALL
        SELECT CAST('2023-10-01' AS DATE) UNION ALL
        SELECT CAST('2023-11-01' AS DATE) UNION ALL
        SELECT CAST('2023-12-01' AS DATE) UNION ALL
        SELECT CAST('2024-01-01' AS DATE) UNION ALL
        SELECT CAST('2024-02-01' AS DATE) UNION ALL
        SELECT CAST('2024-03-01' AS DATE) UNION ALL
        SELECT CAST('2024-04-01' AS DATE) UNION ALL
        SELECT CAST('2024-05-01' AS DATE) UNION ALL
        SELECT CAST('2024-06-01' AS DATE) UNION ALL
        SELECT CAST('2024-07-01' AS DATE)
    ) months ON ssy.ENTER_DATE < DATEADD(MONTH, 1, months.MonthStart)
           AND ISNULL(ssy.LEAVE_DATE, GETDATE()) >= months.MonthStart
WHERE
    CAST(yr.SCHOOL_YEAR AS INT) BETWEEN 2021 AND 2024
    AND ssy.STATUS IS NULL
    AND ssy.EXCLUDE_ADA_ADM IS NULL
GROUP BY
    yr.SCHOOL_YEAR,
    org.ORGANIZATION_NAME,
    ssy.GRADE,
    months.MonthStart
ORDER BY
    yr.SCHOOL_YEAR,
    org.ORGANIZATION_NAME,
    ssy.GRADE,
    months.MonthStart
```

### Key Tables

| Table | Purpose |
|---|---|
| `REV.EPC_STU_SCH_YR` | Student enrollment with enter/leave dates |
| `REV.REV_ORGANIZATION_YEAR` | Links to school/year |
| `REV.REV_YEAR` | School year label |
| `REV.REV_ORGANIZATION` | Campus names |

---

## 5. Online Registration & Enrollment Tracking — Synergy BO Query (Scheduled)

### Description

Pulls **active online enrollment registration (OEN) submissions** for all three Champion campuses for the upcoming school year (SY26-27). Includes student info, application status, flags, comments, and parent contact information. Intended to be saved as a User-Defined Report and scheduled to run daily to support active enrollment efforts.

### How It Works

- Roots on the OEN progress student record (`PXPOENProgressStudent`) which captures each student's online registration application
- Joins to the OEN progress record (`PXPOENProgress`) which holds the parent link and OEN year
- Joins to `PXPOENProgressStudentSchool` for school-specific comments
- Joins to `OENYear` for campus/year display name filtering
- Joins to `ParentGuardianInfo.Parent` then through to `REV_PERSON` for parent name, phone, and email
- Joins to `StudentSchoolYear`, `RevOrganizationYear`, `RevYear`, and `RevOrganization` to pull the student's actual enrolled school year and campus (may be NULL for new applicants not yet formally enrolled)
- Filters to only the three Champion campus OEN year names

### Instructions

1. Navigate to `Synergy SIS > Query > Query`
2. Click the **Type In Query** tab
3. Paste the query below
4. Click **Run** to verify results
5. Click **Save as Report** and name it (e.g., `Daily OEN Enrollment Tracker`)
6. Navigate to `Synergy SIS > System > Schedule` to set a daily recurrence

> **Campus Filter:** The `IF` clause filters by exact `OenYearDisplayName` values. If campus names change in the OEN setup, update these strings to match exactly.

> **NULL Campus/SchoolYear:** New applicants who have not yet been formally enrolled in Synergy will show NULL for `SchoolYear` and `Campus` — this is expected. These fields reflect the student's current enrollment record, not their OEN application.

> **Column Labels:** `StudentName` and `ParentName` use label overrides to prevent both appearing as `FormattedName` in the export output.

### Query

```
K12.PXP.PXPOENProgressStudent R0,
K12.PXP.PXPOENProgress R1 (PxpOenPrgGU,R0.PxpOenPrgGU,Outer),
K12.PXP.PXPOENProgressStudentSchool R3 (OenProgressStuGU,R0.OenProgressStuGU,Outer),
K12.ONLINEENROLLMENTINFO.SETUP.OENYear R2 (OenYearGU,R1.OenYearGU,Outer),
K12.ParentGuardianInfo.Parent R4 (ParentGU,R1.ParentGU,Outer),
K12.EnrollmentInfo.StudentSchoolYear R5 (StudentGU,R0.StudentGU,Outer),
Revelation.OrganizationInfo.RevOrganizationYear R6 (OrganizationYearGU,R5.OrganizationYearGU,Outer),
Revelation.OrganizationInfo.RevYear R7 (YearGU,R6.YearGU,Outer),
Revelation.OrganizationInfo.RevOrganization R8 (OrganizationGU,R6.OrganizationGU,Outer)
COLS R0.FormattedName (,'StudentName'), R0.Grade, R2.OenYearDisplayName,
R7.SchoolYear, R8.OrganizationName (,'Campus'), R0.Status,
R0.NoticeCriticalChanges, R0.NoticeDiscipline, R0.NoticeDocHardCopy,
R0.NoticeDuplicate, R0.NoticeEll, R3.CommentShort, R3.Comment,
R4.FormattedName (,'ParentName'), R4.PrimaryPhone (,'ParentPhone'),
R4.Email (,'ParentEmail')
IF R2.OenYearDisplayName = 'SY26-27 Champion Chandler'
OR R2.OenYearDisplayName = 'SY26-27 Champion South Mountain'
OR R2.OenYearDisplayName = 'SY26-27 Champion San Tan Valley'
Sort R2.OenYearDisplayName, R0.Grade, R0.FormattedName
```

### Column Reference

| Column | Source | Notes |
|---|---|---|
| `StudentName` | `PXPOENProgressStudent` | Student's formatted name |
| `Grade` | `PXPOENProgressStudent` | Grade applied for |
| `OenYearDisplayName` | `OENYear` | Campus + school year label |
| `SchoolYear` | `RevYear` | Current enrolled school year (may be NULL) |
| `Campus` | `RevOrganization` | Current enrolled campus (may be NULL) |
| `Status` | `PXPOENProgressStudent` | Application status |
| `NoticeCriticalChanges` | `PXPOENProgressStudent` | Flag from OEN form |
| `NoticeDiscipline` | `PXPOENProgressStudent` | Flag from OEN form |
| `NoticeDocHardCopy` | `PXPOENProgressStudent` | Flag from OEN form |
| `NoticeDuplicate` | `PXPOENProgressStudent` | Flag from OEN form |
| `NoticeEll` | `PXPOENProgressStudent` | ELL flag from OEN form |
| `CommentShort` | `PXPOENProgressStudentSchool` | Short school-level comment |
| `Comment` | `PXPOENProgressStudentSchool` | Full school-level comment |
| `ParentName` | `ParentGuardianInfo.Parent` | Parent/guardian formatted name |
| `ParentPhone` | `ParentGuardianInfo.Parent` | Primary phone number |
| `ParentEmail` | `ParentGuardianInfo.Parent` | Email address |

### Key Business Objects

| BO | Purpose |
|---|---|
| `K12.PXP.PXPOENProgressStudent` | OEN student application record |
| `K12.PXP.PXPOENProgress` | OEN progress record (links student to parent and year) |
| `K12.PXP.PXPOENProgressStudentSchool` | School-level comments on application |
| `K12.ONLINEENROLLMENTINFO.SETUP.OENYear` | OEN year/campus configuration |
| `K12.ParentGuardianInfo.Parent` | Parent record (links to REV_PERSON for contact info) |
| `K12.EnrollmentInfo.StudentSchoolYear` | Current enrollment record |
| `Revelation.OrganizationInfo.RevOrganizationYear` | Org/year bridge |
| `Revelation.OrganizationInfo.RevYear` | School year |
| `Revelation.OrganizationInfo.RevOrganization` | Campus name |

---

## 6. End-of-Year Update Templates

### Description

At the end of each school year, the three historical SQL queries (ADM, Enrollment History, Retention) need to be updated to include the new year's data. This section documents exactly what to change in each query and provides copy-paste SQL snippets for the new year addition.

Run these updates once the new school year is closed out in Synergy and enrollment/leave dates are finalized for all students.

---

### 6a. ADM Historical — Add a New Year

**What to change:** One line. Update the `BETWEEN` range in the `WHERE` clause.

**Find this line:**

```sql
WHERE
    CAST(yr.SCHOOL_YEAR AS INT) BETWEEN 2021 AND 2024
```

**Replace with (example: adding 2025):**

```sql
WHERE
    CAST(yr.SCHOOL_YEAR AS INT) BETWEEN 2021 AND 2025
```

> That's it — the rest of the query handles the new year automatically via the calendar and organization joins.

---

### 6b. Enrollment History — Add a New Year

**What to change:** Two things — the month subquery and the `WHERE` range filter.

#### Step 1 — Append new months to the subquery

Find the last line of the months subquery (currently ending at July 2024) and add the new school year's months. Replace the last `UNION ALL` block with the extended version:

**Find this at the end of the months subquery:**

```sql
        SELECT CAST('2024-06-01' AS DATE) UNION ALL
        SELECT CAST('2024-07-01' AS DATE)
    ) months ON ssy.ENTER_DATE < DATEADD(MONTH, 1, months.MonthStart)
```

**Replace with (example: adding SY2025, July 2024 – July 2025):**

```sql
        SELECT CAST('2024-06-01' AS DATE) UNION ALL
        SELECT CAST('2024-07-01' AS DATE) UNION ALL
        SELECT CAST('2024-08-01' AS DATE) UNION ALL
        SELECT CAST('2024-09-01' AS DATE) UNION ALL
        SELECT CAST('2024-10-01' AS DATE) UNION ALL
        SELECT CAST('2024-11-01' AS DATE) UNION ALL
        SELECT CAST('2024-12-01' AS DATE) UNION ALL
        SELECT CAST('2025-01-01' AS DATE) UNION ALL
        SELECT CAST('2025-02-01' AS DATE) UNION ALL
        SELECT CAST('2025-03-01' AS DATE) UNION ALL
        SELECT CAST('2025-04-01' AS DATE) UNION ALL
        SELECT CAST('2025-05-01' AS DATE) UNION ALL
        SELECT CAST('2025-06-01' AS DATE) UNION ALL
        SELECT CAST('2025-07-01' AS DATE)
    ) months ON ssy.ENTER_DATE < DATEADD(MONTH, 1, months.MonthStart)
```

#### Step 2 — Extend the WHERE range

**Find this line:**

```sql
WHERE
    CAST(yr.SCHOOL_YEAR AS INT) BETWEEN 2021 AND 2024
```

**Replace with:**

```sql
WHERE
    CAST(yr.SCHOOL_YEAR AS INT) BETWEEN 2021 AND 2025
```

> For each subsequent year, repeat both steps — append 12 months to the subquery (August through the following July) and increment the upper bound of the `BETWEEN` range.

---

### 6c. Retention Historical — Add a New Year

**What to change:** One line. The query uses `>= 2021` to automatically generate all consecutive year pairs, so only the lower bound ever needs changing — and only if you want to drop the oldest year from the report.

The query **automatically includes the new year** as long as data exists in `EPC_STU_SCH_YR` for it. No changes are strictly required at year-end.

However, if you want to drop the oldest year to keep the window rolling (e.g., always show the last 4 years):

**Find this line:**

```sql
    AND CAST(prev_yr.SCHOOL_YEAR AS INT) >= 2021
```

**Replace with (example: rolling forward to drop 2021):**

```sql
    AND CAST(prev_yr.SCHOOL_YEAR AS INT) >= 2022
```

> The new year pair (e.g., 2024→2025) will appear automatically in results as soon as both years have enrollment records in the database.

---

### Year-End Update Checklist

| Query | Action Required | Effort |
|---|---|---|
| ADM Historical | Update `BETWEEN` upper bound | 1 value |
| Enrollment History | Append 12–13 month rows + update `BETWEEN` | ~15 lines |
| Retention Historical | No change required (auto-includes new year) | None |
| ADM Daily BO (scheduled) | No change — runs against current year automatically | None |
| OEN Enrollment BO (scheduled) | Update `OenYearDisplayName` values to next school year | 3 values |
