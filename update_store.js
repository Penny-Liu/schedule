const fs = require('fs');
const path = require('path');
const file = path.join('/Users/liuyaping/Downloads/schedule/services', 'store.ts');
let content = fs.readFileSync(file, 'utf8');

// Add to class properties
if (!content.includes('geneAppointments: GeneAppointment[] = [];')) {
  content = content.replace(
    'meetingRoomBookings: MeetingRoomBooking[] = [];',
    'meetingRoomBookings: MeetingRoomBooking[] = [];\n  geneAppointments: GeneAppointment[] = [];'
  );
}

// Add fetch to loadDataForMonth
if (!content.includes('supabase.from("gene_appointments")')) {
  content = content.replace(
    'const meetingRoomsRes = await supabase',
    `const geneRes = await supabase
        .from("gene_appointments")
        .select("*")
        .gte("date", startStr)
        .lte("date", endStr);
      
      const meetingRoomsRes = await supabase`
  );
  
  content = content.replace(
    'if (meetingRoomsRes.data) {',
    `if (geneRes.data) {
        const parsed = geneRes.data.map((b: any) => { const m = {...b}; this.mapFromDbFields(m); return m; });
        this.geneAppointments = merge(this.geneAppointments, parsed);
      }
      
      if (meetingRoomsRes.data) {`
  );
}

// Add fetch to loadDataForUser (Wait, loadDataForUser might be for specific user's own data, skip if gene is global)
// Usually loadDataForMonth is enough for calendar apps.

// Add Methods
const methods = `
  // --- Gene Appointments ---
  getGeneAppointments() {
    return [...this.geneAppointments];
  }

  async addGeneAppointments(appointments: GeneAppointment[]) {
    this.geneAppointments.push(...appointments);
    this.notifyListeners();

    try {
      const records = appointments.map((b) => ({
        id: b.id,
        date: b.date,
        start_time: b.startTime,
        end_time: b.endTime,
        medical_record_number: b.medicalRecordNumber,
        registered_by: b.registeredBy
      }));
      const { error } = await supabase.from("gene_appointments").insert(records);
      if (error) throw error;
      
      await this.logOperation("gene_appointment_create", \`新增基因預約 \${bookings.length} 筆\`);
    } catch (e) {
      console.error("Failed to add gene appointments:", e);
      const ids = appointments.map((b) => b.id);
      this.geneAppointments = this.geneAppointments.filter((b) => !ids.includes(b.id));
      this.notifyListeners();
      throw e;
    }
  }

  async deleteGeneAppointment(id: string) {
    const bookingToDel = this.geneAppointments.find((b) => b.id === id);
    this.geneAppointments = this.geneAppointments.filter((b) => b.id !== id);
    this.notifyListeners();

    try {
      const { error } = await supabase.from("gene_appointments").delete().eq("id", id);
      if (error) throw error;
      if (bookingToDel) {
        await this.logOperation("gene_appointment_delete", \`刪除基因預約 \${bookingToDel.date} \${bookingToDel.startTime}\`);
      }
    } catch (e) {
      console.error("Failed to delete gene appointment:", e);
      if (bookingToDel) {
        this.geneAppointments.push(bookingToDel);
      }
      this.notifyListeners();
      throw e;
    }
  }
`;

if (!content.includes('addGeneAppointments(')) {
  content = content.replace(
    '// --- Meeting Room Bookings ---',
    methods + '\n  // --- Meeting Room Bookings ---'
  );
}

// Add to mapFromDbFields
if (!content.includes('m.startTime = m.start_time;')) {
  content = content.replace(
    'if ("start_time" in m) {',
    `if ("start_time" in m) {
      m.startTime = m.start_time;
      delete m.start_time;
    }`
  );
}

if (!content.includes('medicalRecordNumber = m.medical_record_number')) {
  content = content.replace(
    'if ("end_time" in m) {',
    `if ("end_time" in m) {
      m.endTime = m.end_time;
      delete m.end_time;
    }
    if ("medical_record_number" in m) {
      m.medicalRecordNumber = m.medical_record_number;
      delete m.medical_record_number;
    }
    if ("registered_by" in m) {
      m.registeredBy = m.registered_by;
      delete m.registered_by;
    }
    if ("created_at" in m) {
      m.createdAt = m.created_at;
      delete m.created_at;
    }`
  );
}

fs.writeFileSync(file, content);
console.log("Updated store.ts");
