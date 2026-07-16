const schedule = {
  morningStartTime: "08:30",
  morningEndTime: "10:30",
  afternoonStartTime: "13:30",
  afternoonEndTime: "15:00"
};
const time = "15:00";
const isTimeSlotOpen = (time >= schedule.morningStartTime && time <= schedule.morningEndTime) || (time >= schedule.afternoonStartTime && time <= schedule.afternoonEndTime);
console.log("isTimeSlotOpen for 15:00:", isTimeSlotOpen);

const time2 = "15:30";
const isTimeSlotOpen2 = (time2 >= schedule.morningStartTime && time2 <= schedule.morningEndTime) || (time2 >= schedule.afternoonStartTime && time2 <= schedule.afternoonEndTime);
console.log("isTimeSlotOpen for 15:30:", isTimeSlotOpen2);
