# Monday.com Board Import Guide

I've created an Excel file (`monday_board_import.xlsx`) that you can import into Monday.com to set up the board with all the correct columns.

## 📁 Files Created

- `monday_board_import.xlsx` - Main import file (Excel format)
- `monday_board_import.csv` - Backup import file (CSV format)
- `create_monday_board.py` - Script that generated these files

## 🚀 Import Steps

### 1. Download the Excel File
- The file is located at: `C:\Users\msewe\Desktop\abs_scrape\monday_board_import.xlsx`
- Download it to your computer

### 2. Go to Monday.com
- Log into your Monday.com workspace
- Navigate to your main workspace

### 3. Create New Board
- Click the **"+"** button to create a new board
- Choose **"Import from Excel"** or **"Import from CSV"**
- Upload the `monday_board_import.xlsx` file

### 4. Configure the Board
- **Name the board**: `ABS Shift Data`
- **Set column types** (the Excel file has sample data to help with this):
  - `date` → **Date** column
  - `time` → **Text** column
  - `start_time` → **Text** column
  - `end_time` → **Text** column
  - `client` → **Text** column
  - `employee` → **Text** column
  - `location` → **Text** column
  - `product` → **Text** column
  - `bill_rate` → **Text** column
  - `pay_rate` → **Text** column
  - `status` → **Status** column

### 5. Configure Status Column
- Set up the status column with these values and colors:
  - **Open** → Red
  - **Assigned** → Green
  - **Completed** → Blue

### 6. Get the Board ID
- After creating the board, look at the URL
- It will be like: `https://bscmemphis.monday.com/boards/1234567890`
- Copy the number at the end (e.g., `1234567890`)

### 7. Add Board ID to Environment
- Open your `.env` file
- Add this line:
  ```bash
  MONDAY_BOARD_ID=1234567890
  ```
- Replace `1234567890` with your actual board ID

### 8. Test the Integration
- Run: `npm run sync-monday`
- The integration should now work and add your scraped data to the board

## 📊 Sample Data

The Excel file includes sample data that shows:
- Different shift types and times
- Various clients and employees
- Different locations
- All three status types (Open, Assigned, Completed)
- Sample billing and pay rates

## 🔧 Troubleshooting

If the import doesn't work:
1. Try the CSV version instead of Excel
2. Make sure all column names match exactly
3. Check that the status column is set up with the right colors
4. Verify the board ID is correct in your `.env` file

## ✅ Success!

Once imported, you'll have a properly configured board that the integration can use to sync your scraped data automatically.
