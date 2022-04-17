const { app } = require('electron');
// const isDevelopment = process.env.NODE_ENV === 'dev';
module.exports = {
	client: "sqlite",
	connection: {
		// filename: isDevelopment ? `${__dirname}/../db.sqlite` : `${app.getPath('userData')}/db.sqlite`,
		filename: `${app.getPath('userData')}/db.sqlite`
	},
	migrations: {
		extension: 'js',
		tableName: "knex_migrations",
		directory: `${__dirname}/migrations`,
	},
	useNullAsDefault: true,
};