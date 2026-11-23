import {LeaveType,LeaveStatus,UserRole,type LeaveRequest,type User} from '../types';
export function isRadiographerPreLeave(leave:LeaveRequest|undefined,user:User|undefined):boolean {
 return !!leave&&!!user&&leave.type===LeaveType.PRE_SCHEDULED&&leave.startDate===leave.endDate&&(user.isRadiographer===true||[UserRole.SUPERVISOR,UserRole.RADIOGRAPHER_STAFF,UserRole.RADIOGRAPHER_ASSISTANT].includes(user.role));
}
export function validatePreLeavePriority(leave:LeaveRequest|undefined,user:User|undefined,priority:number|null,leaves:LeaveRequest[]):void {
 if(!isRadiographerPreLeave(leave,user))throw new Error('僅能設定放射師單日預假的優先休順序');
 if(priority===null)return;
 if(!Number.isInteger(priority)||priority<1||priority>999)throw new Error('順位請填寫 1～999 的整數，或清除順位');
 if(leave!.status===LeaveStatus.REJECTED)throw new Error('已駁回的預假不可設定順位');
 if(leaves.some(l=>l.id!==leave!.id&&l.type===LeaveType.PRE_SCHEDULED&&l.startDate===leave!.startDate&&l.status!==LeaveStatus.REJECTED&&l.preLeavePriority===priority))throw new Error('同一天已有相同順位，請先清除原順位再調整');
}
