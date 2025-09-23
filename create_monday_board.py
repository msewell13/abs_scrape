#!/usr/bin/env python3
"""
Create an Excel file for importing into Monday.com
This will create a board with the correct columns for ABS shift data
"""

import pandas as pd
from datetime import datetime
import os

def create_monday_import_file():
    """Create an Excel file that can be imported into Monday.com"""
    
    # Sample data that matches our JSON structure
    sample_data = [
        {
            'date': '2025-09-01',
            'time': '6:40 AM - 9:40 AM',
            'start_time': '6:40 AM',
            'end_time': '9:40 AM',
            'client': 'Smith, Tony',
            'employee': 'Nolen, Carlos',
            'location': 'TN - Memphis',
            'product': 'CHOICES Personal Care (T1019)',
            'bill_rate': '$26.36',
            'pay_rate': '$13.00',
            'status': 'Completed'
        },
        {
            'date': '2025-09-01',
            'time': '7:00 AM - 7:00 PM',
            'start_time': '7:00 AM',
            'end_time': '7:00 PM',
            'client': 'Smith, Bryce',
            'employee': 'Johnson, Sarah',
            'location': 'TN - Nashville',
            'product': 'Home Health Aide (HHA)',
            'bill_rate': '$28.50',
            'pay_rate': '$15.00',
            'status': 'Assigned'
        },
        {
            'date': '2025-09-02',
            'time': '8:00 AM - 12:00 PM',
            'start_time': '8:00 AM',
            'end_time': '12:00 PM',
            'client': 'Davis, Mary',
            'employee': '',
            'location': 'TN - Knoxville',
            'product': 'Personal Care Services',
            'bill_rate': '$25.00',
            'pay_rate': '$12.50',
            'status': 'Open'
        }
    ]
    
    # Create DataFrame
    df = pd.DataFrame(sample_data)
    
    # Add some additional sample rows to show different statuses
    additional_rows = [
        {
            'date': '2025-09-02',
            'time': '2:00 PM - 6:00 PM',
            'start_time': '2:00 PM',
            'end_time': '6:00 PM',
            'client': 'Wilson, John',
            'employee': 'Brown, Michael',
            'location': 'TN - Chattanooga',
            'product': 'Companion Care',
            'bill_rate': '$22.00',
            'pay_rate': '$11.00',
            'status': 'Completed'
        },
        {
            'date': '2025-09-03',
            'time': '9:00 AM - 5:00 PM',
            'start_time': '9:00 AM',
            'end_time': '5:00 PM',
            'client': 'Taylor, Lisa',
            'employee': 'Garcia, Maria',
            'location': 'TN - Memphis',
            'product': 'Skilled Nursing',
            'bill_rate': '$35.00',
            'pay_rate': '$18.00',
            'status': 'Assigned'
        }
    ]
    
    # Add additional rows
    df = pd.concat([df, pd.DataFrame(additional_rows)], ignore_index=True)
    
    # Create the Excel file
    filename = 'monday_board_import.xlsx'
    
    with pd.ExcelWriter(filename, engine='openpyxl') as writer:
        # Write the main data sheet
        df.to_excel(writer, sheet_name='ABS Shift Data', index=False)
        
        # Create a column mapping sheet for reference
        column_mapping = pd.DataFrame([
            {'Column Name': 'date', 'Monday.com Type': 'Date', 'Description': 'Shift date (YYYY-MM-DD format)'},
            {'Column Name': 'time', 'Monday.com Type': 'Text', 'Description': 'Full time range (e.g., "6:40 AM - 9:40 AM")'},
            {'Column Name': 'start_time', 'Monday.com Type': 'Text', 'Description': 'Start time (e.g., "6:40 AM")'},
            {'Column Name': 'end_time', 'Monday.com Type': 'Text', 'Description': 'End time (e.g., "9:40 AM")'},
            {'Column Name': 'client', 'Monday.com Type': 'Text', 'Description': 'Client name (e.g., "Smith, Tony")'},
            {'Column Name': 'employee', 'Monday.com Type': 'Text', 'Description': 'Employee name (e.g., "Nolen, Carlos")'},
            {'Column Name': 'location', 'Monday.com Type': 'Text', 'Description': 'Work location (e.g., "TN - Memphis")'},
            {'Column Name': 'product', 'Monday.com Type': 'Text', 'Description': 'Service/product type'},
            {'Column Name': 'bill_rate', 'Monday.com Type': 'Text', 'Description': 'Billing rate (e.g., "$26.36")'},
            {'Column Name': 'pay_rate', 'Monday.com Type': 'Text', 'Description': 'Pay rate (e.g., "$13.00")'},
            {'Column Name': 'status', 'Monday.com Type': 'Status', 'Description': 'Shift status: Open (red), Assigned (green), Completed (blue)'}
        ])
        
        column_mapping.to_excel(writer, sheet_name='Column Mapping', index=False)
        
        # Create instructions sheet
        instructions = pd.DataFrame([
            {'Step': 1, 'Action': 'Download this Excel file', 'Details': 'Save monday_board_import.xlsx to your computer'},
            {'Step': 2, 'Action': 'Go to Monday.com', 'Details': 'Log into your Monday.com workspace'},
            {'Step': 3, 'Action': 'Create new board', 'Details': 'Click "+" to create a new board'},
            {'Step': 4, 'Action': 'Import from Excel', 'Details': 'Choose "Import from Excel" option'},
            {'Step': 5, 'Action': 'Upload file', 'Details': 'Upload this Excel file'},
            {'Step': 6, 'Action': 'Name the board', 'Details': 'Name it "ABS Shift Data"'},
            {'Step': 7, 'Action': 'Map columns', 'Details': 'Use the Column Mapping sheet to set correct column types'},
            {'Step': 8, 'Action': 'Set status colors', 'Details': 'Configure status column: Open=red, Assigned=green, Completed=blue'},
            {'Step': 9, 'Action': 'Get board ID', 'Details': 'Copy the board ID from the URL and add to .env as MONDAY_BOARD_ID'},
            {'Step': 10, 'Action': 'Test integration', 'Details': 'Run "npm run sync-monday" to test'}
        ])
        
        instructions.to_excel(writer, sheet_name='Instructions', index=False)
    
    print(f"✅ Created {filename}")
    print(f"📁 File location: {os.path.abspath(filename)}")
    print("\n📋 Next steps:")
    print("1. Download the Excel file")
    print("2. Go to Monday.com and create a new board")
    print("3. Import this Excel file")
    print("4. Name the board 'ABS Shift Data'")
    print("5. Get the board ID from the URL")
    print("6. Add MONDAY_BOARD_ID to your .env file")
    print("7. Run 'npm run sync-monday'")
    
    return filename

if __name__ == "__main__":
    create_monday_import_file()
