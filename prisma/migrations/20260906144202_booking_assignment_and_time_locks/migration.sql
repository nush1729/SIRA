-- CreateTable
CREATE TABLE "BookingAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    CONSTRAINT "BookingAssignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookingAssignment_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterviewerTimeLock" (
    "interviewerId" TEXT NOT NULL,
    "cellStartUtc" DATETIME NOT NULL,
    "bookingId" TEXT NOT NULL,

    PRIMARY KEY ("interviewerId", "cellStartUtc"),
    CONSTRAINT "InterviewerTimeLock_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InterviewerTimeLock_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingAssignment_bookingId_interviewerId_key" ON "BookingAssignment"("bookingId", "interviewerId");

-- CreateIndex
CREATE INDEX "InterviewerTimeLock_bookingId_idx" ON "InterviewerTimeLock"("bookingId");
