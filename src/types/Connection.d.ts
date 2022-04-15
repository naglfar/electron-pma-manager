declare type Connection = {
	id: number,
	name: string,
	mysql_user?: string,
	mysql_password?: string,
	mysql_password_ask?: boolean,
	mysql_port?: string,
	ssh_host?: string,
	favorite?: boolean,

};