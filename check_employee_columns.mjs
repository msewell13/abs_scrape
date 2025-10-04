import dotenv from 'dotenv';
dotenv.config();

const query = `
  query {
    boards(ids: [${process.env.EMPLOYEE_BOARD_ID}]) {
      columns {
        id
        title
        type
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
console.log('Employee board columns:');
data.data.boards[0].columns.forEach(col => {
  console.log(`- ${col.title} (ID: ${col.id}, Type: ${col.type})`);
});

