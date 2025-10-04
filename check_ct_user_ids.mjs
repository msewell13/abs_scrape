import dotenv from 'dotenv';
dotenv.config();

const query = `
  query {
    boards(ids: [${process.env.EMPLOYEE_BOARD_ID}]) {
      items_page(limit: 500) {
        items {
          id
          name
          column_values {
            id
            text
            value
          }
        }
      }
    }
  }
`;

const response = await fetch('https://api.monday.com/v2', {
  method: 'POST',
  headers: {
    'Authorization': process.env.MONDAY_API_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query })
});

const data = await response.json();
const employees = data.data.boards[0].items_page.items;

console.log('Employees with CTUserId values:');
let count = 0;
employees.forEach(employee => {
  const ctUserIdColumn = employee.column_values.find(cv => cv.id === 'text_mkw92f6f');
  if (ctUserIdColumn && ctUserIdColumn.text && ctUserIdColumn.text.trim() !== '') {
    console.log(`- ${employee.name}: ${ctUserIdColumn.text}`);
    count++;
  }
});

console.log(`\nTotal employees with CTUserId: ${count} out of ${employees.length}`);

