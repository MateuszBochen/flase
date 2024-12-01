"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Settings_1 = __importDefault(require("../Settings/Settings"));
const jwt = require('jsonwebtoken');
class JWT {
    static getJwtToken(payload) {
        const options = {
            expiresIn: Settings_1.default.getJWTTokenExpire(),
        };
        return jwt.sign(payload, Settings_1.default.getJWTSecret(), options);
    }
}
exports.default = JWT;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSldULmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FwcC9KV1QvSldULnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsb0VBQTRDO0FBRzVDLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUVwQyxNQUFNLEdBQUc7SUFDQSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQW1CO1FBQzNDLE1BQU0sT0FBTyxHQUFHO1lBQ2QsU0FBUyxFQUFFLGtCQUFRLENBQUMsaUJBQWlCLEVBQUU7U0FDeEMsQ0FBQTtRQUVELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsa0JBQVEsQ0FBQyxZQUFZLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM3RCxDQUFDO0NBQ0Y7QUFFRCxrQkFBZSxHQUFHLENBQUMifQ==