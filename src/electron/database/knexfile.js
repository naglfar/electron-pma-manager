const { paths } = require('../paths');
module.exports = {
	client: "sqlite",
	connection: {
		filename: paths.db,
	},
	migrations: {
		extension: 'js',
		tableName: "knex_migrations",
		directory: `${__dirname}/migrations`,
	},
	useNullAsDefault: true,
};
