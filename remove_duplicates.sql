DELETE FROM doctor_shifts a 
USING doctor_shifts b 
WHERE a.doctor_id = b.doctor_id 
  AND a.date = b.date 
  AND a.id > b.id;
