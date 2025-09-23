#!/usr/bin/env python3
"""
Create a sample Monday.com board import file with fake data
This replaces the real client data with anonymized sample data
"""

import pandas as pd
from datetime import datetime, timedelta
import random

def create_sample_data():
    """Generate fake sample data for Monday.com board import"""
    
    # Sample data
    sample_clients = [
        "Sample Client A", "Sample Client B", "Sample Client C", 
        "Sample Client D", "Sample Client E", "Sample Client F"
    ]
    
    sample_employees = [
        "John Smith", "Jane Doe", "Mike Johnson", "Sarah Wilson",
        "David Brown", "Lisa Davis", "Tom Miller", "Amy Garcia"
    ]
    
    sample_products = [
        "Personal Care", "Companion Care", "Respite Care", 
        "Medication Management", "Transportation", "Meal Prep"
    ]
    
    sample_locations = [
        "TN - Memphis", "TN - Nashville", "AR - Little Rock",
        "MS - Jackson", "AL - Birmingham", "LA - New Orleans"
    ]
    
    sample_statuses = ["Open", "Assigned", "Completed"]
    
    # Generate sample records
    records = []
    base_date = datetime(2025, 9, 1)
    
    for i in range(20):  # Create 20 sample records
        date = base_date + timedelta(days=random.randint(0, 29))
        client = random.choice(sample_clients)
        employee = random.choice(sample_employees)
        
        # Generate time range
        start_hour = random.randint(6, 10)
        start_min = random.choice([0, 15, 30, 45])
        end_hour = start_hour + random.randint(2, 8)
        end_min = random.choice([0, 15, 30, 45])
        
        start_time = f"{start_hour:02d}:{start_min:02d} {'AM' if start_hour < 12 else 'PM'}"
        end_time = f"{end_hour:02d}:{end_min:02d} {'AM' if end_hour < 12 else 'PM'}"
        
        record = {
            'date': date.strftime('%Y-%m-%d'),
            'time': f"{start_time} - {end_time}",
            'start_time': start_time,
            'end_time': end_time,
            'client': client,
            'employee': employee,
            'location': random.choice(sample_locations),
            'product': random.choice(sample_products),
            'bill_rate': f"${random.uniform(25.00, 45.00):.2f}",
            'pay_rate': f"${random.uniform(15.00, 25.00):.2f}",
            'status': random.choice(sample_statuses)
        }
        records.append(record)
    
    return records

def main():
    """Create the sample Excel file"""
    print("Creating sample Monday.com board import file...")
    
    # Generate sample data
    sample_data = create_sample_data()
    
    # Create DataFrame
    df = pd.DataFrame(sample_data)
    
    # Save to Excel
    output_file = 'monday_board_import.xlsx'
    df.to_excel(output_file, index=False, sheet_name='ABS Shift Data')
    
    print(f"✅ Created {output_file} with {len(sample_data)} sample records")
    print("📋 Sample data includes:")
    print("   - Fake client names (Sample Client A-F)")
    print("   - Fake employee names (John Smith, Jane Doe, etc.)")
    print("   - Sample products and locations")
    print("   - Random dates in September 2025")
    print("   - Random time ranges and rates")
    print("   - Sample statuses (Open, Assigned, Completed)")
    print("\n🔒 No real client data included - safe to commit to repository")

if __name__ == "__main__":
    main()
