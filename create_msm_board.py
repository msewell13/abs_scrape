#!/usr/bin/env python3
"""
Create a sample Monday.com board import file for Mobile Shift Maintenance data
This creates an Excel file with sample MSM data for manual board import
"""

import pandas as pd
from datetime import datetime, timedelta
import random

def create_msm_sample_data():
    """Generate fake sample data for MSM Monday.com board import"""
    
    # Sample data
    sample_customers = [
        "Sample Customer A", "Sample Customer B", "Sample Customer C", 
        "Sample Customer D", "Sample Customer E", "Sample Customer F"
    ]
    
    sample_employees = [
        "John Smith", "Jane Doe", "Mike Johnson", "Sarah Wilson",
        "David Brown", "Lisa Davis", "Tom Miller", "Amy Garcia"
    ]
    
    sample_exception_types = [
        "Late Arrival", "Early Departure", "No Show", "Call Off",
        "Overtime", "Under Time", "Schedule Change", "Emergency"
    ]
    
    # Generate sample records
    records = []
    base_date = datetime(2025, 9, 1)
    
    for i in range(25):  # Create 25 sample records
        date = base_date + timedelta(days=random.randint(0, 29))
        customer = random.choice(sample_customers)
        employee = random.choice(sample_employees)
        
        # Generate time ranges
        sch_start_hour = random.randint(6, 10)
        sch_start_min = random.choice([0, 15, 30, 45])
        sch_end_hour = sch_start_hour + random.randint(6, 10)
        sch_end_min = random.choice([0, 15, 30, 45])
        
        actual_start_hour = sch_start_hour + random.randint(-1, 1)
        actual_start_min = sch_start_min + random.choice([-15, 0, 15])
        actual_end_hour = sch_end_hour + random.randint(-1, 1)
        actual_end_min = sch_end_min + random.choice([-15, 0, 15])
        
        # Format times
        sch_start = f"{sch_start_hour:02d}:{sch_start_min:02d} {'AM' if sch_start_hour < 12 else 'PM'}"
        sch_end = f"{sch_end_hour:02d}:{sch_end_min:02d} {'AM' if sch_end_hour < 12 else 'PM'}"
        actual_start = f"{actual_start_hour:02d}:{actual_start_min:02d} {'AM' if actual_start_hour < 12 else 'PM'}"
        actual_end = f"{actual_end_hour:02d}:{actual_end_min:02d} {'AM' if actual_end_hour < 12 else 'PM'}"
        
        # Calculate hours
        sch_hours = round((sch_end_hour - sch_start_hour) + (sch_end_min - sch_start_min) / 60, 2)
        actual_hours = round((actual_end_hour - actual_start_hour) + (actual_end_min - actual_start_min) / 60, 2)
        adjusted_hours = round(actual_hours + random.uniform(-0.5, 0.5), 2)
        
        record = {
            'Date': date.strftime('%Y-%m-%d'),
            'Customer': customer,
            'Employee': employee,
            'Sch Start': sch_start,
            'Sch End': sch_end,
            'Sch Hrs': f"{sch_hours:.2f}",
            'Actual Start': actual_start,
            'Actual End': actual_end,
            'Actual Hrs': f"{actual_hours:.2f}",
            'Adjusted Start': actual_start,  # Usually same as actual
            'Adjusted End': actual_end,      # Usually same as actual
            'Adjusted Hrs': f"{adjusted_hours:.2f}",
            'Exception Type': random.choice(sample_exception_types) if random.random() < 0.3 else None
        }
        records.append(record)
    
    return records

def main():
    """Create the sample Excel file"""
    print("Creating sample MSM Monday.com board import file...")
    
    # Generate sample data
    sample_data = create_msm_sample_data()
    
    # Create DataFrame
    df = pd.DataFrame(sample_data)
    
    # Save to Excel
    output_file = 'msm_board_import.xlsx'
    df.to_excel(output_file, index=False, sheet_name='MSM Data')
    
    print(f"✅ Created {output_file} with {len(sample_data)} sample records")
    print("📋 Sample data includes:")
    print("   - Fake customer names (Sample Customer A-F)")
    print("   - Fake employee names (John Smith, Jane Doe, etc.)")
    print("   - Sample exception types (Late Arrival, No Show, etc.)")
    print("   - Random dates in September 2025")
    print("   - Realistic time ranges and hour calculations")
    print("\n🔒 No real client data included - safe to commit to repository")

if __name__ == "__main__":
    main()
