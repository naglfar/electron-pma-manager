module.exports = {
	client: "sqlite",
	connection: {
		filename: `${__dirname}/../db.sqlite`,
	},
	migrations: {
		extension: 'js',
		tableName: "knex_migrations",
		directory: `${__dirname}/migrations`,
	},
	useNullAsDefault: true,
};