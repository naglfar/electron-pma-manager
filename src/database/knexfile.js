module.exports = {
	client: "sqlite",
	connection: {
		filename: `${__dirname}/../db.sqlite`,
	},
	migrations: {
		extension: 'ts',
		tableName: "knex_migrations",
		directory: `${__dirname}/migrations`,
	},
	useNullAsDefault: true,
};