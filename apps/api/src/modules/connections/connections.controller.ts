import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Put } from "@nestjs/common";
import { ConnectionsService } from "./connections.service";

@Controller("connections/hub")
export class ConnectionsController {
  constructor(@Inject(ConnectionsService) private readonly connections: ConnectionsService) {}

  @Get()
  getHubConnection() {
    return this.connections.getHubConnection();
  }

  @Put()
  @HttpCode(200)
  saveHubConnection(@Body() body: unknown) {
    return this.connections.saveHubConnection(body);
  }

  @Delete()
  @HttpCode(200)
  deleteHubConnection() {
    return this.connections.deleteHubConnection();
  }

  @Post("test")
  @HttpCode(200)
  testHubConnection() {
    return this.connections.testHubConnection();
  }
}
